import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const ROOT = join(import.meta.dirname, "..");
const TAURI_CONF = join(ROOT, "apps", "desktop", "src-tauri", "tauri.conf.json");
const ROOT_PACKAGE = join(ROOT, "package.json");
const DESKTOP_PACKAGE = join(ROOT, "apps", "desktop", "package.json");
const CARGO_TOML = join(ROOT, "apps", "desktop", "src-tauri", "Cargo.toml");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readJsonVersion(path: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`Could not parse ${path}. Expected a JSON file with a "version" field.`);
  }
  const version = (parsed as { version?: unknown }).version;
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    fail(`Current version in ${path} is not a valid MAJOR.MINOR.PATCH version.`);
  }
  return version as string;
}

function writeJsonVersion(path: string, version: string): void {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  parsed["version"] = version;
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

function isGreater(next: string, current: string): boolean {
  const nextParts = next.split(".").map(Number);
  const currentParts = current.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const nextPart = nextParts[index] ?? 0;
    const currentPart = currentParts[index] ?? 0;
    if (nextPart > currentPart) return true;
    if (nextPart < currentPart) return false;
  }
  return false;
}

function bump(version: string, kind: "patch" | "minor" | "major"): string {
  const [major, minor, patch] = version.split(".").map(Number) as [number, number, number];
  if (kind === "patch") return `${String(major)}.${String(minor)}.${String(patch + 1)}`;
  if (kind === "minor") return `${String(major)}.${String(minor + 1)}.0`;
  return `${String(major + 1)}.0.0`;
}

function main(): void {
  const argument = process.argv[2];
  if (argument === undefined) {
    fail("Usage: node scripts/bump-version.ts <patch|minor|major|X.Y.Z>");
  }
  const current = readJsonVersion(TAURI_CONF);
  let next: string;
  if (argument === "patch" || argument === "minor" || argument === "major") {
    next = bump(current, argument);
  } else if (VERSION_PATTERN.test(argument)) {
    next = argument;
  } else {
    fail(`Invalid version "${argument}". Use patch, minor, major, or MAJOR.MINOR.PATCH.`);
  }
  if (!isGreater(next, current)) {
    fail(`New version ${next} must be greater than the current version ${current}.`);
  }

  writeJsonVersion(ROOT_PACKAGE, next);
  writeJsonVersion(DESKTOP_PACKAGE, next);
  writeJsonVersion(TAURI_CONF, next);

  const cargo = readFileSync(CARGO_TOML, "utf8");
  const lines = cargo.split("\n");
  let inPackage = false;
  let replaced = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "[package]") {
      inPackage = true;
      continue;
    }
    if (inPackage && line.startsWith("[")) break;
    if (inPackage && !replaced && /^version = ".*"$/.test(line.trim())) {
      lines[index] = `version = "${next}"`;
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    fail(`Could not find the [package] version line in ${CARGO_TOML}. No files were changed.`);
  }
  writeFileSync(CARGO_TOML, lines.join("\n"));

  execFileSync(
    "cargo",
    ["metadata", "--format-version", "1", "--manifest-path", CARGO_TOML, "--offline"],
    { stdio: "ignore" },
  );

  console.log(
    `Version ${current} → ${next}. Next: add a CHANGELOG-PUBLIC.md entry, commit "chore(release): v${next}", open a PR to master.`,
  );
}

main();
