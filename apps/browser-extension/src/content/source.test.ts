import { describe, expect, it } from "vitest";
import {
  SourceMapCache,
  applicationFrames,
  findSourceMappingUrl,
  normalizeSourcePath,
  parseStack,
  resolveSource,
} from "./source";

const viteStack = [
  "Error: react-stack-top-frame",
  "    at exports.jsxDEV (http://localhost:1420/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=abc:250:50)",
  "    at SaveButton (http://localhost:1420/src/components/SaveButton.tsx?t=17:12:5)",
  "    at App (http://localhost:1420/src/App.tsx:30:7)",
].join("\n");

describe("stack parsing", () => {
  it("parses V8 frames and skips React internals", () => {
    expect(parseStack(viteStack)).toHaveLength(3);
    const frames = applicationFrames(viteStack);
    expect(frames[0]).toEqual({ url: "http://localhost:1420/src/components/SaveButton.tsx?t=17", line: 12, column: 5 });
  });

  it("parses Turbopack style frames", () => {
    const stack = "Error\n    at Page (turbopack:///[project]/src/app/page.tsx:8:3)";
    expect(applicationFrames(stack)[0]?.line).toBe(8);
  });
});

describe("normalizeSourcePath", () => {
  it.each([
    ["webpack://_N_E/./src/app/page.tsx", "src/app/page.tsx"],
    ["webpack:///./src/index.tsx", "src/index.tsx"],
    ["webpack://my-app/./src/a.tsx", "src/a.tsx"],
    ["turbopack:///[project]/src/app/page.tsx", "src/app/page.tsx"],
    ["file:///C:/work/app/src/a.tsx", "C:/work/app/src/a.tsx"],
    ["/@fs/C:/work/app/src/a.tsx", "C:/work/app/src/a.tsx"],
    ["http://localhost:1420/src/App.tsx?t=3", "src/App.tsx"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeSourcePath(input, "http://localhost:1420")).toBe(expected);
  });
});

function inlineMap(sources: string[]): string {
  // One segment per generated line mapping column 0 to source 0, line 42 (0-based 41), column 5 (0-based 4).
  const map = { version: 3, sources, names: [], mappings: "AAyCI", file: "bundle.js" };
  return `data:application/json;base64,${btoa(JSON.stringify(map))}`;
}

describe("symbolication", () => {
  it("reads the last sourceMappingURL", () => {
    expect(findSourceMappingUrl("a\n//# sourceMappingURL=one.map\nb\n//# sourceMappingURL=two.map")).toBe("two.map");
  });

  it("resolves an inline base64 map", async () => {
    const script = `code\n//# sourceMappingURL=${inlineMap(["webpack://_N_E/./src/Card.tsx"])}`;
    const cache = new SourceMapCache(() => Promise.resolve(script));
    const stack = "Error\n    at Card (http://localhost:3000/_next/static/chunks/app.js:1:1)";
    const result = await resolveSource(stack, cache, "http://localhost:3000");
    expect(result).toEqual({ ok: true, location: { file: "src/Card.tsx", line: 42, column: 5 } });
  });

  it("reports no-source-map when the script has no map", async () => {
    const cache = new SourceMapCache(() => Promise.resolve("console.log(1)"));
    const result = await resolveSource("Error\n    at A (http://x.test/a.js:1:1)", cache, "http://x.test");
    expect(result).toEqual({ ok: false, reason: "no-source-map" });
  });

  it("reports fetch-failed when the script cannot be loaded", async () => {
    const cache = new SourceMapCache(() => Promise.resolve(null));
    const result = await resolveSource("Error\n    at A (http://x.test/a.js:1:1)", cache, "http://x.test");
    expect(result).toEqual({ ok: false, reason: "fetch-failed" });
  });

  it("caches at most the configured number of maps", async () => {
    let fetches = 0;
    const cache = new SourceMapCache(() => {
      fetches += 1;
      return Promise.resolve("no map here");
    }, 2);
    for (const name of ["a", "b", "c", "a"]) {
      await cache.symbolicate({ url: `http://x.test/${name}.js`, line: 1, column: 1 }, "http://x.test");
    }
    expect(fetches).toBe(4);
  });
});
