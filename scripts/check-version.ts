import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const FILES = [
  "package.json",
  "apps/desktop/package.json",
  "apps/desktop/src-tauri/tauri.conf.json",
  "apps/desktop/src-tauri/Cargo.toml",
] as const;

function jsonVersion(relative: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(join(ROOT, relative), "utf8")) as {
      version?: unknown;
    };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

function cargoVersion(): string | null {
  const cargo = readFileSync(join(ROOT, "apps", "desktop", "src-tauri", "Cargo.toml"), "utf8");
  const lines = cargo.split("\n");
  let inPackage = false;
  for (const line of lines) {
    if (line.trim() === "[package]") {
      inPackage = true;
      continue;
    }
    if (inPackage && line.startsWith("[")) break;
    const match = inPackage ? /^version = "(.*)"$/.exec(line.trim()) : null;
    if (match !== null) return match[1] ?? null;
  }
  return null;
}

function main(): void {
  const versions = new Map<string, string>();
  for (const relative of FILES) {
    const version = relative.endsWith("Cargo.toml") ? cargoVersion() : jsonVersion(relative);
    versions.set(relative, version ?? "(unreadable)");
  }
  const unique = new Set(versions.values());
  if (unique.size !== 1) {
    console.error("Version mismatch:");
    for (const [file, version] of versions) {
      console.error(`  ${file}: ${version}`);
    }
    process.exit(1);
  }
  console.log(`Version ${[...unique][0]} is consistent`);
}

main();
