/**
 * Writes THIRD_PARTY_NOTICES.txt for the shipped desktop app.
 *
 * Covers what actually ends up in the package: Rust crates linked into
 * `capkit-desktop.exe` for Windows x64 (normal dependencies only; build
 * scripts, proc macros, and dev dependencies never ship), and the production
 * npm packages bundled into the frontend, including the OFL-1.1 fonts.
 * License files are copied verbatim from each package; identical texts are
 * printed once with the packages that use them.
 *
 * Usage (Node 24+, from the repository root, after `pnpm.cmd install`):
 *   node scripts/third-party-notices.ts [--out <file>]
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CARGO_MANIFEST = join(ROOT, "apps", "desktop", "src-tauri", "Cargo.toml");
const DESKTOP_PACKAGE = "@snaphub/desktop";
const TARGET = "x86_64-pc-windows-msvc";
const LICENSE_FILE = /^(licen[cs]e|copying|notice|unlicense)([-_.].*)?$/i;
// Type declarations are erased at build time; nothing from them ships.
const TYPE_ONLY_PACKAGE = /^(@types\/|csstype$)/;

type Component = {
  ecosystem: "Rust crate" | "npm package";
  name: string;
  version: string;
  license: string;
  source: string;
  licenseTexts: readonly string[];
};

function record(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} is not an object`);
  }
  // Narrowed above: a non-null, non-array object.
  return value as Record<string, unknown>;
}

function list(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${context} is not an array`);
  return value;
}

function text(value: unknown, context: string): string {
  if (typeof value !== "string") throw new Error(`${context} is not a string`);
  return value;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readLicenseTexts(directory: string, declaredFile: string | null): string[] {
  const names = new Set<string>();
  if (declaredFile !== null) names.add(declaredFile);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && LICENSE_FILE.test(entry.name)) names.add(entry.name);
  }
  return [...names]
    .sort()
    .map((name) => readFileSync(resolve(directory, name), "utf8").replace(/\r\n/g, "\n").trim())
    .filter((content) => content !== "");
}

function rustComponents(): Component[] {
  const metadata = record(
    JSON.parse(
      execFileSync(
        "cargo",
        ["metadata", "--format-version", "1", "--locked", "--filter-platform", TARGET, "--manifest-path", CARGO_MANIFEST],
        { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
      ),
    ),
    "cargo metadata",
  );
  const packages = new Map<string, Record<string, unknown>>();
  for (const entry of list(metadata.packages, "packages")) {
    const item = record(entry, "package");
    packages.set(text(item.id, "package id"), item);
  }
  const resolveGraph = record(metadata.resolve, "resolve");
  const rootId = text(resolveGraph.root, "resolve root");
  const edges = new Map<string, string[]>();
  for (const entry of list(resolveGraph.nodes, "resolve nodes")) {
    const node = record(entry, "resolve node");
    const normal = list(node.deps, "node deps")
      .map((dep) => record(dep, "node dep"))
      .filter((dep) =>
        list(dep.dep_kinds, "dep kinds").some((kind) => record(kind, "dep kind").kind === null),
      )
      .map((dep) => text(dep.pkg, "dep pkg"));
    edges.set(text(node.id, "node id"), normal);
  }

  const isProcMacro = (item: Record<string, unknown>): boolean =>
    list(item.targets, "targets").some((target) =>
      list(record(target, "target").kind, "target kind").includes("proc-macro"),
    );

  const shipped = new Set<string>();
  const pending = [...(edges.get(rootId) ?? [])];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || shipped.has(id)) continue;
    const item = packages.get(id);
    // Proc macros run inside the compiler; neither they nor their own
    // dependencies are linked into the binary.
    if (item === undefined || isProcMacro(item)) continue;
    shipped.add(id);
    pending.push(...(edges.get(id) ?? []));
  }

  return [...shipped].map((id) => {
    const item = record(packages.get(id), "shipped package");
    const name = text(item.name, "package name");
    const directory = dirname(text(item.manifest_path, "manifest path"));
    return {
      ecosystem: "Rust crate",
      name,
      version: text(item.version, "package version"),
      license: optionalText(item.license) ?? "See license file",
      source: optionalText(item.repository) ?? `https://crates.io/crates/${name}`,
      licenseTexts: readLicenseTexts(directory, optionalText(item.license_file)),
    } satisfies Component;
  });
}

function npmComponents(): Component[] {
  const pnpmArguments = ["--filter", DESKTOP_PACKAGE, "licenses", "list", "--prod", "--json"];
  // `pnpm` is a .cmd shim on Windows, which execFile cannot start directly.
  const [command, commandArguments] = process.platform === "win32"
    ? ["cmd.exe", ["/d", "/c", "pnpm.cmd", ...pnpmArguments]]
    : ["pnpm", pnpmArguments];
  const output = execFileSync(command, commandArguments, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const byLicense = record(JSON.parse(output), "pnpm licenses");
  const components: Component[] = [];
  for (const entries of Object.values(byLicense)) {
    for (const entry of list(entries, "license group")) {
      const item = record(entry, "npm package");
      const name = text(item.name, "npm name");
      if (TYPE_ONLY_PACKAGE.test(name)) continue;
      const versions = list(item.versions, "npm versions").map((version) => text(version, "npm version"));
      const paths = list(item.paths, "npm paths").map((path) => text(path, "npm path"));
      versions.forEach((version, index) => {
        const directory = paths[index] ?? paths[0];
        components.push({
          ecosystem: "npm package",
          name,
          version,
          license: text(item.license, "npm license"),
          source: optionalText(item.homepage) ?? `https://www.npmjs.com/package/${name}`,
          licenseTexts: directory === undefined ? [] : readLicenseTexts(directory, null),
        });
      });
    }
  }
  return components;
}

function render(components: readonly Component[], appVersion: string): string {
  const sorted = [...components].sort(
    (left, right) =>
      left.ecosystem.localeCompare(right.ecosystem)
      || left.name.localeCompare(right.name)
      || left.version.localeCompare(right.version),
  );
  const users = new Map<string, string[]>();
  const missing: string[] = [];
  for (const component of sorted) {
    const label = `${component.name} ${component.version}`;
    if (component.licenseTexts.length === 0) missing.push(`${label} (${component.license}, ${component.source})`);
    for (const licenseText of component.licenseTexts) {
      users.set(licenseText, [...(users.get(licenseText) ?? []), label]);
    }
  }

  const lines = [
    "CapKit third-party notices",
    `CapKit ${appVersion}`,
    "",
    "CapKit includes the open-source software listed below. Each component is",
    "used under its own license, reproduced in full in the License texts",
    "section. CapKit's own license is in LICENSE.txt.",
    "",
  ];
  for (const ecosystem of ["Rust crate", "npm package"] as const) {
    const group = sorted.filter((component) => component.ecosystem === ecosystem);
    lines.push(`== ${ecosystem}s (${group.length}) ==`, "");
    for (const component of group) {
      lines.push(`${component.name} ${component.version} | ${component.license} | ${component.source}`);
    }
    lines.push("");
  }
  if (missing.length > 0) {
    lines.push(
      "== Components without a bundled license file ==",
      "",
      "These packages publish no license file. Their declared license applies;",
      "source code and license terms are available at the listed address.",
      "",
      ...missing,
      "",
    );
  }
  lines.push("== License texts ==", "");
  for (const [licenseText, labels] of users) {
    lines.push("-".repeat(78), `Used by: ${labels.join(", ")}`, "-".repeat(78), "", licenseText, "");
  }
  return `${lines.join("\r\n")}\r\n`;
}

function parseOut(argv: readonly string[]): string {
  const index = argv.indexOf("--out");
  if (index === -1) return join(ROOT, "apps", "desktop", "src-tauri", "target", "THIRD_PARTY_NOTICES.txt");
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error("--out needs a file path");
  return resolve(value);
}

const out = parseOut(process.argv.slice(2));
const appVersion = text(
  record(JSON.parse(readFileSync(join(ROOT, "apps", "desktop", "package.json"), "utf8")), "package.json").version,
  "app version",
);
const components = [...rustComponents(), ...npmComponents()];
writeFileSync(out, render(components, appVersion), "utf8");
process.stdout.write(`Wrote ${components.length} components to ${out}\n`);
