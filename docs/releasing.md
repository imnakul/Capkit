# Releasing CapKit

1. Bump the version once: `pnpm.cmd version:bump minor` (or `patch`, `major`, or an explicit `X.Y.Z`). The script writes the new version to all four version files and updates `Cargo.lock`.
2. Add a `CHANGELOG-PUBLIC.md` entry under the new version heading describing what users get.
3. Commit `chore(release): vA.B.C` and open a PR to `master`.
4. Merge the PR. The push to `master` carries a version with no matching `v<version>` tag, so the Release action builds the Windows installer and publishes `CapKit A.B.C` with the installer and its `.sha256` file.
5. Watch the Release action to green, then download and smoke-test from the Releases page.

## Release notes encoding

The publish step runs under Windows PowerShell 5.1, where `>` writes UTF-16 and `Add-Content` appends ANSI text, so `gh release create --notes-file` once read the bytes as UTF-8 and published NUL-separated garbage. The workflow now captures the generated notes into a variable (with `[Console]::OutputEncoding` forced to UTF-8 first) and writes `notes.md` with `[System.IO.File]::WriteAllText` as UTF-8 without a BOM. The `.sha256` line is untouched: it is ASCII hex.
