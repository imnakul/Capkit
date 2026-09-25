[CmdletBinding()]
param(
    [ValidatePattern('^[1-9][0-9]{0,4}\.[0-9]{1,5}\.[0-9]{1,5}\.0$')]
    [string]$PackageVersion = '1.0.2.0',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked {
    param(
        [Parameter(Mandatory)]
        [string]$Command,
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE`: $Command $($Arguments -join ' ')"
    }
}

$versionSegments = $PackageVersion.Split('.')
if ($versionSegments.Where({ [int]$_ -gt 65535 }).Count -gt 0) {
    throw 'Every MSIX version segment must be between 0 and 65535.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$tauriRoot = Join-Path $repoRoot 'apps\desktop\src-tauri'
$storeRoot = Join-Path $tauriRoot 'target\store'
$stageRoot = Join-Path $storeRoot 'stage\x64'
$uploadStage = Join-Path $storeRoot 'upload'
$symbolStage = Join-Path $storeRoot 'symbols'
$releaseRoot = Join-Path $tauriRoot 'target\release'
$executablePath = Join-Path $releaseRoot 'capkit-desktop.exe'
$pdbPath = Join-Path $releaseRoot 'capkit_desktop.pdb'
$manifestTemplate = Join-Path $tauriRoot 'msix\AppxManifest.xml'
$iconRoot = Join-Path $tauriRoot 'icons'
$packageName = "CapKit_${PackageVersion}_x64"
$msixPath = Join-Path $storeRoot "$packageName.msix"
$symbolPath = Join-Path $storeRoot "$packageName.appxsym"
$uploadPath = Join-Path $storeRoot "$packageName.msixupload"

$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$makeAppx = Get-ChildItem -Path $sdkRoot -Filter 'makeappx.exe' -File -Recurse |
    Where-Object { $_.DirectoryName -like '*\x64' } |
    Sort-Object -Property FullName -Descending |
    Select-Object -First 1
if ($null -eq $makeAppx) {
    throw 'MakeAppx.exe was not found. Install the Windows 10/11 SDK before building the Store package.'
}

if (-not $SkipBuild) {
    $env:pnpm_config_verify_deps_before_run = 'false'
    Invoke-Checked -Command 'pnpm.cmd' -Arguments @('--filter', '@snaphub/desktop', 'tauri', 'build', '--no-bundle')
}
if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw "Release executable not found: $executablePath"
}

$executableBytes = [System.IO.File]::ReadAllBytes($executablePath)
if ($executableBytes.Length -lt 256 -or
    $executableBytes[0] -ne 0x4D -or
    $executableBytes[1] -ne 0x5A) {
    throw 'The release executable is not a valid Windows PE file.'
}
$peHeaderOffset = [BitConverter]::ToInt32($executableBytes, 0x3C)
$optionalHeaderOffset = $peHeaderOffset + 24
$subsystem = [BitConverter]::ToUInt16($executableBytes, $optionalHeaderOffset + 68)
if ($subsystem -ne 2) {
    throw "The Store executable uses PE subsystem $subsystem instead of Windows GUI subsystem 2. A console window would open at launch."
}

$resolvedStoreRoot = [System.IO.Path]::GetFullPath($storeRoot)
$resolvedTargetRoot = [System.IO.Path]::GetFullPath((Join-Path $tauriRoot 'target'))
if (-not $resolvedStoreRoot.StartsWith($resolvedTargetRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to clear an MSIX staging path outside the Tauri target directory.'
}
if (Test-Path -LiteralPath $storeRoot) {
    Remove-Item -LiteralPath $storeRoot -Recurse -Force
}

$assetsRoot = Join-Path $stageRoot 'Assets'
New-Item -ItemType Directory -Path $assetsRoot, $uploadStage, $symbolStage -Force | Out-Null
Copy-Item -LiteralPath $executablePath -Destination (Join-Path $stageRoot 'capkit-desktop.exe')
foreach ($asset in @('Square44x44Logo.png', 'Square150x150Logo.png', 'StoreLogo.png')) {
    Copy-Item -LiteralPath (Join-Path $iconRoot $asset) -Destination (Join-Path $assetsRoot $asset)
}

$manifest = (Get-Content -LiteralPath $manifestTemplate -Raw).Replace('__PACKAGE_VERSION__', $PackageVersion)
[System.IO.File]::WriteAllText(
    (Join-Path $stageRoot 'AppxManifest.xml'),
    $manifest,
    [System.Text.UTF8Encoding]::new($false)
)

Invoke-Checked -Command $makeAppx.FullName -Arguments @(
    'pack', '/d', $stageRoot, '/p', $msixPath, '/h', 'SHA256', '/o'
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $pdbPath -PathType Leaf) {
    Copy-Item -LiteralPath $pdbPath -Destination (Join-Path $symbolStage 'capkit_desktop.pdb')
    [System.IO.Compression.ZipFile]::CreateFromDirectory($symbolStage, $symbolPath)
    Copy-Item -LiteralPath $symbolPath -Destination (Join-Path $uploadStage (Split-Path -Leaf $symbolPath))
}
Copy-Item -LiteralPath $msixPath -Destination (Join-Path $uploadStage (Split-Path -Leaf $msixPath))
[System.IO.Compression.ZipFile]::CreateFromDirectory($uploadStage, $uploadPath)

[xml]$packedManifest = Get-Content -LiteralPath (Join-Path $stageRoot 'AppxManifest.xml') -Raw
$identity = $packedManifest.Package.Identity
if ($identity.Name -ne 'JagatBandhu.SnapHub' -or
    $identity.Publisher -ne 'CN=8A6295E4-CFC2-4019-B7E3-C5FE35587B52' -or
    $identity.Version -ne $PackageVersion) {
    throw 'The generated package identity does not match the reserved Partner Center identity.'
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class SnaphubStoreIdentity
{
    [StructLayout(LayoutKind.Sequential)]
    private struct PackageId
    {
        public uint Reserved;
        public uint ProcessorArchitecture;
        public ulong Version;
        public IntPtr Name;
        public IntPtr Publisher;
        public IntPtr ResourceId;
        public IntPtr PublisherId;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern int PackageFamilyNameFromId(
        ref PackageId packageId,
        ref uint packageFamilyNameLength,
        StringBuilder packageFamilyName);

    public static string GetFamilyName(string name, string publisher)
    {
        var packageId = new PackageId
        {
            ProcessorArchitecture = 9,
            Version = 0x0001000000000000,
            Name = Marshal.StringToHGlobalUni(name),
            Publisher = Marshal.StringToHGlobalUni(publisher),
            ResourceId = Marshal.StringToHGlobalUni(string.Empty)
        };
        try
        {
            uint length = 0;
            PackageFamilyNameFromId(ref packageId, ref length, null);
            var familyName = new StringBuilder((int)length);
            var result = PackageFamilyNameFromId(ref packageId, ref length, familyName);
            if (result != 0)
            {
                throw new InvalidOperationException(string.Format("PackageFamilyNameFromId failed with Win32 error {0}.", result));
            }
            return familyName.ToString();
        }
        finally
        {
            Marshal.FreeHGlobal(packageId.Name);
            Marshal.FreeHGlobal(packageId.Publisher);
            Marshal.FreeHGlobal(packageId.ResourceId);
        }
    }
}
'@
$expectedFamilyName = 'JagatBandhu.SnapHub_s98vdgsmvcg9t'
$actualFamilyName = [SnaphubStoreIdentity]::GetFamilyName($identity.Name, $identity.Publisher)
if ($actualFamilyName -ne $expectedFamilyName) {
    throw "Package family mismatch. Expected $expectedFamilyName, calculated $actualFamilyName."
}

Write-Host ''
Write-Host 'CapKit Store artifacts created:' -ForegroundColor Green
Write-Host "  MSIX:       $msixPath"
Write-Host "  MSIXUPLOAD: $uploadPath"
Write-Host "  Family:     $actualFamilyName"
if (Test-Path -LiteralPath $symbolPath) {
    Write-Host "  Symbols:    $symbolPath"
}
Write-Host ''
Write-Host 'Upload the .msixupload file to the MSIX or PWA app submission in Partner Center.'
