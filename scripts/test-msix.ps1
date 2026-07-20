[CmdletBinding()]
param(
    [string]$PackagePath = '',
    [string]$ReportPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Windows App Certification Kit must run from an elevated PowerShell session.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$storeRoot = Join-Path $repoRoot 'apps\desktop\src-tauri\target\store'
if ([string]::IsNullOrWhiteSpace($PackagePath)) {
    $package = Get-ChildItem -LiteralPath $storeRoot -Filter '*.msix' -File |
        Sort-Object -Property LastWriteTime -Descending |
        Select-Object -First 1
    if ($null -eq $package) {
        throw 'No MSIX package was found. Run pnpm.cmd bundle:store first.'
    }
    $PackagePath = $package.FullName
}
if ([string]::IsNullOrWhiteSpace($ReportPath)) {
    $ReportPath = Join-Path $storeRoot 'wack-report.xml'
}

$appCert = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\App Certification Kit\appcert.exe'
if (-not (Test-Path -LiteralPath $appCert -PathType Leaf)) {
    throw 'appcert.exe was not found. Install the Windows App Certification Kit.'
}

& $appCert reset
if (Test-Path -LiteralPath $ReportPath) {
    Remove-Item -LiteralPath $ReportPath -Force
}
& $appCert test -appxpackagepath $PackagePath -reportoutputpath $ReportPath
if (-not (Test-Path -LiteralPath $ReportPath -PathType Leaf)) {
    throw 'WACK completed without producing a report.'
}

[xml]$report = Get-Content -LiteralPath $ReportPath -Raw
$overallResult = $report.REPORT.OVERALL_RESULT
Write-Host "WACK overall result: $overallResult"

$failedTests = $report.SelectNodes('//TEST[RESULT="FAIL"]')
foreach ($test in $failedTests) {
    $requirement = $test.ParentNode
    $severity = if ($test.OPTIONAL -eq 'TRUE') { 'optional' } else { 'required' }
    Write-Warning "$severity failure: $($requirement.TITLE) / $($test.NAME)"
    foreach ($message in $test.MESSAGES.MESSAGE) {
        Write-Warning $message.TEXT
    }
}

if ($overallResult -ne 'PASS') {
    throw "WACK did not pass. Review $ReportPath"
}

Write-Host "WACK report: $ReportPath" -ForegroundColor Green
