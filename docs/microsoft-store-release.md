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
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-msix.ps1 -PackageVersion 1.0.2.0
```

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
10. Confirm the startup preference persists through a Store update. The existing Tauri autostart plugin must be validated against the versioned MSIX install path; if it fails, replace it with a declared Windows startup task before certification.
11. Run the Windows App Certification Kit and resolve every blocker.
12. Uninstall and confirm package files are removed while user-authored captures remain intact.

Do not claim packaged-runtime acceptance from a successful build alone. Screen capture, shortcuts, startup, shell integration, and window behavior require physical testing of the installed Store package.
