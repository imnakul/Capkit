/** A minimal view of a React fiber; every field is read defensively because the page owns the object. */
export type FiberLike = {
  type?: unknown;
  return?: FiberLike | null;
  _debugOwner?: FiberLike | null;
  _debugSource?: { fileName?: unknown; lineNumber?: unknown; columnNumber?: unknown } | null;
  _debugStack?: { stack?: unknown } | null;
};

const MINIFIED_NAME = /^[a-zA-Z$_]{1,2}$/;

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** displayName ?? name for a function or object component type (including memo and forwardRef). */
export function componentName(type: unknown): string | null {
  if (typeof type !== "function" && (typeof type !== "object" || type === null)) return null;
  const record = type as Record<string, unknown>; // React component types are functions or plain objects; fields are probed with typeof.
  const render = record.render as Record<string, unknown> | undefined;
  const inner = record.type as Record<string, unknown> | undefined;
  return (
    str(record.displayName) ??
    str(record.name) ??
    str(render?.displayName) ??
    str(render?.name) ??
    str(inner?.name)
  );
}

export function isMinifiedName(name: string): boolean {
  return MINIFIED_NAME.test(name);
}

export function fiberKey(element: object): string | undefined {
  return Object.keys(element).find((key) => key.startsWith("__reactFiber$"));
}

/** Nearest fiber on the element or its ancestors. */
export function findFiber(element: Element | null): FiberLike | null {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const key = fiberKey(node);
    if (key !== undefined) return (node as unknown as Record<string, FiberLike>)[key] ?? null; // key came from Object.keys of this node
  }
  return null;
}

function ownerOf(fiber: FiberLike): FiberLike | null {
  if (fiber._debugOwner) return fiber._debugOwner;
  for (let next = fiber.return; next; next = next.return) {
    if (typeof next.type === "function" || (typeof next.type === "object" && next.type !== null)) return next;
  }
  return null;
}

export type ComponentInfo = { name: string; ownerPath: string[] };

/** The component that rendered the element, plus up to six named owners (nearest last). */
export function describeComponent(hostFiber: FiberLike): ComponentInfo | "minified" | null {
  const first = ownerOf(hostFiber);
  if (first === null) return null;
  const names: string[] = [];
  let sawMinified = false;
  for (let owner: FiberLike | null = first; owner !== null && names.length < 6; owner = ownerOf(owner)) {
    const name = componentName(owner.type);
    if (name === null) continue;
    if (isMinifiedName(name)) {
      sawMinified = true;
      break;
    }
    names.push(name);
  }
  if (names.length === 0) return sawMinified ? "minified" : null;
  const nearest = names[0] ?? "";
  const path = names.slice(0, 6).reverse();
  return { name: nearest, ownerPath: path };
}

/** The stack string where this host element's JSX was written (React 19), if present. */
export function debugStack(fiber: FiberLike): string | null {
  return str(fiber._debugStack?.stack);
}

/** The React 18 _debugSource, if present. */
export function debugSource(fiber: FiberLike): { file: string; line: number; column: number } | null {
  const source = fiber._debugSource;
  if (source === null || source === undefined) return null;
  const file = str(source.fileName);
  if (file === null || typeof source.lineNumber !== "number") return null;
  return { file, line: source.lineNumber, column: typeof source.columnNumber === "number" ? source.columnNumber : 1 };
}
