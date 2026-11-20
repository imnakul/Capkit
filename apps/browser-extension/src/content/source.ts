import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

export type SourceLocation = { file: string; line: number; column: number };
export type StackFrame = { url: string; line: number; column: number };

const SKIPPED_FRAME = /node_modules|\/\.vite\/deps\/|react-dom|react_jsx-dev-runtime|jsx-dev-runtime|react-stack-top-frame/;
const FRAME_PATTERN = /((?:https?|file|webpack-internal|turbopack):[^\s()]*?):(\d+):(\d+)\)?\s*$/;

/** Frames of a V8 stack string, in order, excluding the message line. */
export function parseStack(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const raw of stack.split("\n")) {
    const match = FRAME_PATTERN.exec(raw.trim());
    if (match === null) continue;
    const [, url = "", line = "0", column = "0"] = match;
    frames.push({ url, line: Number(line), column: Number(column) });
  }
  return frames;
}

/** Frames that belong to application code, in order. */
export function applicationFrames(stack: string): StackFrame[] {
  return parseStack(stack).filter((frame) => !SKIPPED_FRAME.test(frame.url));
}

/** Strips bundler prefixes, the page origin, query strings and a leading "./". */
export function normalizeSourcePath(source: string, pageOrigin: string): string {
  let path = source;
  path = path.replace(/^webpack:\/\/_N_E\//, "");
  path = path.replace(/^webpack:\/\/\//, "");
  path = path.replace(/^webpack:\/\/[^/]+\//, "");
  path = path.replace(/^turbopack:\/\/\/\[project\]\//, "");
  path = path.replace(/^file:\/\/\//, "");
  path = path.replace(/^\/@fs\//, "");
  if (pageOrigin !== "" && path.startsWith(pageOrigin)) path = path.slice(pageOrigin.length);
  path = path.replace(/[?#].*$/, "");
  path = path.replace(/^\.\//, "");
  return path.replace(/^\//, "");
}

export function isDependencyPath(path: string): boolean {
  return path.includes("node_modules");
}

export type MapFetcher = (url: string) => Promise<string | null>;

export type SymbolicationResult =
  | { ok: true; location: SourceLocation }
  | { ok: false; reason: "no-source-map" | "fetch-failed" };

function decodeInlineMap(url: string): string | null {
  const match = /^data:[^,]*;base64,(.*)$/.exec(url);
  if (match === null) return null;
  try {
    const binary = atob(match[1] ?? "");
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** The last //# sourceMappingURL= comment, or null. */
export function findSourceMappingUrl(script: string): string | null {
  const matches = [...script.matchAll(/\/\/[#@]\s*sourceMappingURL=([^\s]+)\s*$/gm)];
  return matches[matches.length - 1]?.[1] ?? null;
}

/** Caches parsed maps per script URL, up to `limit` entries. */
export class SourceMapCache {
  private readonly maps = new Map<string, TraceMap | "none">();

  constructor(
    private readonly fetchText: MapFetcher,
    private readonly limit = 20,
  ) {}

  private remember(url: string, value: TraceMap | "none"): void {
    if (this.maps.size >= this.limit) {
      const oldest = this.maps.keys().next();
      if (oldest.done !== true) this.maps.delete(oldest.value);
    }
    this.maps.set(url, value);
  }

  private async load(scriptUrl: string): Promise<TraceMap | "none" | "failed"> {
    const cached = this.maps.get(scriptUrl);
    if (cached !== undefined) return cached;
    const script = await this.fetchText(scriptUrl);
    if (script === null) return "failed";
    const mapUrl = findSourceMappingUrl(script);
    if (mapUrl === null) {
      this.remember(scriptUrl, "none");
      return "none";
    }
    let mapText = decodeInlineMap(mapUrl);
    if (mapText === null) {
      const resolved = new URL(mapUrl, scriptUrl).href;
      mapText = await this.fetchText(resolved);
      if (mapText === null) return "failed";
    }
    try {
      const map = new TraceMap(mapText);
      this.remember(scriptUrl, map);
      return map;
    } catch {
      this.remember(scriptUrl, "none");
      return "none";
    }
  }

  async symbolicate(frame: StackFrame, pageOrigin: string): Promise<SymbolicationResult> {
    const map = await this.load(frame.url);
    if (map === "failed") return { ok: false, reason: "fetch-failed" };
    if (map === "none") return { ok: false, reason: "no-source-map" };
    const original = originalPositionFor(map, { line: frame.line, column: Math.max(0, frame.column - 1) });
    if (original.source === null) return { ok: false, reason: "no-source-map" };
    return {
      ok: true,
      location: {
        file: normalizeSourcePath(original.source, pageOrigin),
        line: original.line,
        column: original.column + 1,
      },
    };
  }
}

/** Resolves the first application frame to an original location; falls through node_modules results. */
export async function resolveSource(
  stack: string,
  cache: SourceMapCache,
  pageOrigin: string,
): Promise<SymbolicationResult> {
  let failure: SymbolicationResult = { ok: false, reason: "no-source-map" };
  for (const frame of applicationFrames(stack).slice(0, 4)) {
    const result = await cache.symbolicate(frame, pageOrigin);
    if (result.ok) {
      if (isDependencyPath(result.location.file)) continue;
      return result;
    }
    failure = result;
  }
  return failure;
}
