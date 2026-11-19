# Microsoft Store release

## Confirmed identity

These values are assigned by Partner Center and must match every Store package exactly:

- Package identity name: `JagatBandhu.SnapHub`
- Publisher: `CN=8A6295E4-CFC2-4019-B7E3-C5FE35587B52`
- Package family name: `JagatBandhu.SnapHub_s98vdgsmvcg9t`
- Publisher display name: `JagatBandhu`
- Store ID: `9PJ3XBSNXK2X`
- Public Store URL: `https://apps.microsoft.com/detail/9PJ3XBSNXK2X`
- MSA app ID: `2900ea2a-edf4-463f-96cb-79f4c532f07c`

The visible product name is `CapKit`. The Store identity preserves Partner Center's assigned `SnapHub` casing because that identity is immutable and is not a user-facing naming decision.

## Build

**Confirmed:** CapKit uses a manually assembled Desktop Bridge MSIX because Tauri 2 currently generates EXE and MSI installers, not MSIX packages.

From Windows with Node.js, pnpm, Rust, and the Windows 10/11 SDK installed:

```powershell
pnpm.cmd install
pnpm.cmd bundle:store
```

For a later Store version:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-msix.ps1 -PackageVersion 1.3.0.0
```

**Confirmed (Microsoft rule):** A Store package version has four segments. The first segment cannot be `0`, the last must be `0`, and every new submission must be higher than the last one. So the app version `0.3.0` cannot become package `0.3.0.0`. The build script rejects it.

**Provisional:** Package versions map app `0.X.Y` to `1.X.Y.0`, so app 0.3.0 ships as `1.3.0.0`. That is also higher than the earlier `1.0.2.0` build.

Outputs are written under `apps/desktop/src-tauri/target/store`:

- `CapKit_<version>_x64.msix`: raw x64 package
- `CapKit_<version>_x64.appxsym`: compressed public symbols when a release PDB exists
- `CapKit_<version>_x64.msixupload`: Partner Center submission artifact containing the package and symbols

Upload the `.msixupload` file under the product created as **MSIX or PWA app**. Microsoft signs the certified Store package; a CA certificate is not required for Store-only distribution. Direct sideloading still requires a trusted signature or an explicit development-only unsigned installation path.

The GitHub Actions workflow `.github/workflows/store-msix.yml` exposes the package version as a manual input, runs all frontend and Rust checks, builds the release binary, creates the Store artifacts, and uploads the `.msixupload` as a workflow artifact.

Run the Windows App Certification Kit from an elevated PowerShell session after every release build:

```powershell
pnpm.cmd test:store
```

## Runtime model

**Confirmed:** The manifest declares CapKit as a `packagedClassicApp` at `mediumIL` with the restricted `runFullTrust` capability. This is intentional: capture, global shortcuts, tray lifecycle, clipboard integration, window enumeration, scrolling input, and pinned windows are Win32 desktop behaviors and must not be moved into an AppContainer.

The package targets x64 Windows Desktop with Windows 11 build `22000` as its minimum. ARM64 remains a separate future package and acceptance matrix.

**Confirmed:** Open at startup uses a manifest `windows.startupTask` (`CapKitStartup`, declared `Enabled="false"`), never a Run registry entry. At runtime, CapKit checks for package identity. If it has one, Settings drives the startup task. If not (the NSIS installer and dev builds), it keeps the `tauri-plugin-autostart` sign-in entry. A startup-task launch can't pass arguments, so CapKit treats that activation like `--background` and stays in the tray. If a user turns CapKit off in Settings > Apps > Startup or in Task Manager, Windows doesn't let the app turn it back on. CapKit then locks the switch, explains why, and links to `ms-settings:startupapps`.

**Confirmed:** The manifest declares the `microphone` and `webcam` device capabilities for recording audio and the camera overlay. Windows shows its own consent prompt, and lists CapKit under the camera and microphone privacy settings. The Partner Center privacy policy URL must stay published, because the app accesses these devices.

**Confirmed:** Every package contains `LICENSE.txt` and a `THIRD_PARTY_NOTICES.txt` generated at build time by `scripts/third-party-notices.ts` (`pnpm.cmd notices`). The notices cover:

- the Rust crates linked into the Windows x64 binary;
- the production npm packages bundled into the frontend, including the OFL-1.1 fonts Plus Jakarta Sans, JetBrains Mono, and Caveat;
- the verbatim license texts for all of these.

A few packages publish no license file. The notices list them with their declared license and source address.

## Store acceptance checklist

Automated build acceptance:

- Frontend type-check, lint, and tests pass.
- Rust formatting, Clippy with warnings denied, and tests pass.
- `MakeAppx.exe` semantic validation succeeds without disabling validation.
- Manifest identity, publisher, and version are checked after staging.
- `.msixupload` contains the x64 `.msix` plus symbols when available.
- The initial `1.0.0.0` package passed WACK overall on Windows 11 using SDK `10.0.26100.7705`. Store package `1.0.2.0` contains both the no-console fix and the corrected Partner Center publisher identity and must receive its own WACK report before submission.

WACK currently reports one optional static **Blocked executables** failure while retaining an overall result of **PASS**. The compiled binary imports `CreateProcessW` and `ShellExecuteW` and contains command-name strings. Tauri/WebView infrastructure can launch child processes, and CapKit intentionally uses the Windows shell to open the configured capture folder and saved images. CapKit does not install drivers or services, run a command shell as part of its capture workflow, or request elevation. Preserve this explanation for certification notes and investigate any future required failure rather than suppressing validation.

Suggested `runFullTrust` justification for Partner Center:

> CapKit is a user-invoked screenshot utility. It requires full-trust Win32 access for system-wide capture shortcuts, monitor and window capture, UI Automation target detection, clipboard image transfer, always-on-top pinned image windows, tray operation, local file export, and synthesized scrolling input. It does not install drivers or services and does not require administrator privileges.

Physical packaged-app acceptance remains required before submission:

1. Install a locally trusted test-signed MSIX or use a private Partner Center package flight.
2. Confirm first launch enters the tray without showing the dashboard.
3. Confirm Dashboard opens from Start and from the tray.
4. Confirm capture, capture-and-copy, and capture-and-save global shortcuts register and report conflicts.
5. Confirm capture works across multiple monitors and mixed DPI.
6. Confirm Copy writes the final rasterized image to the Windows clipboard.
7. Confirm Save, save-folder selection, dashboard thumbnails, View, Open Folder, and Delete work outside the package install directory.
8. Confirm Pin renders the capture, remains always on top, and can copy, save, click through, and close.
9. Confirm automatic and manual scrolling capture.
10. Confirm the startup task:
    - Turning it on in Settings opens CapKit into the tray at the next sign-in.
    - Turning it off in Windows Settings locks the CapKit switch, and "Open Startup settings" reaches the right page.
    - The setting survives a Store update.
11. Run the Windows App Certification Kit and resolve every blocker.
12. Uninstall and confirm package files are removed while user-authored captures remain intact.
13. Confirm the microphone and camera consent prompts appear, CapKit is listed under the camera and microphone privacy settings, and recordings capture microphone audio and the camera track.
14. Open `THIRD_PARTY_NOTICES.txt` and `LICENSE.txt` in the install folder and confirm both are current.

Do not claim packaged-runtime acceptance from a successful build alone. Screen capture, shortcuts, startup, shell integration, and window behavior require physical testing of the installed Store package.
