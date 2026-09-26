# Releasing CapKit

1. Bump the version once: `pnpm.cmd version:bump minor` (or `patch`, `major`, or an explicit `X.Y.Z`). The script writes the new version to all four version files and updates `Cargo.lock`.
2. Add a `CHANGELOG-PUBLIC.md` entry under the new version heading describing what users get.
3. Commit `chore(release): vA.B.C` and open a PR to `master`.
4. Merge the PR. The push to `master` carries a version with no matching `v<version>` tag, so the Release action builds the Windows installer and publishes `CapKit A.B.C` with the installer and its `.sha256` file.
5. Watch the Release action to green, then download and smoke-test from the Releases page.
