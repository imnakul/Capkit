import type { CssViewport, ElementDetails, PhysicalRect } from "./protocol";

export type NoteDetailSource = "extension" | "accessibility" | "none";

export type NoteMarkdownNote = {
  number: number;
  comment: string;
  /** One element for a point note, up to 20 for an area note, null without extension data. */
  details: readonly ElementDetails[] | null;
  isArea: boolean;
  /** Accessibility data, used only when `details` is null. */
  fallback: { role: string; name: string; box: PhysicalRect | null } | null;
};

export type NoteMarkdownInput = {
  pageTitle: string | null;
  pageUrl: string | null;
  capturedAt: Date;
  /** Local offset east of UTC, in minutes (the negative of `Date.getTimezoneOffset()`). */
  utcOffsetMinutes: number;
  screenshotPath: string;
  cssViewport: CssViewport | null;
  detail: NoteDetailSource;
  notes: readonly NoteMarkdownNote[];
};

const DETAIL_LABELS: Record<NoteDetailSource, string> = {
  extension: "CapKit Inspector",
  accessibility: "Windows accessibility",
  none: "none",
};

const UNAVAILABLE_REASONS: Record<NonNullable<ElementDetails["sourceUnavailableReason"]>, string> = {
  "no-react": "no React found",
  "production-build": "production build",
  "no-source-map": "no source map",
  "fetch-failed": "source map could not be loaded",
};

const pad = (value: number): string => String(value).padStart(2, "0");

function formatLocal(date: Date, offsetMinutes: number): string {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return `${String(shifted.getUTCFullYear())}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

function formatUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function hex(channel: number): string {
  return Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0");
}

/** Converts `rgb()`/`rgba()` to `#rrggbb` (or `#rrggbbaa` below full opacity). Other values pass through. */
export function toHexColor(value: string): string {
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value.trim());
  if (match === null) return value.trim();
  const [, red = "0", green = "0", blue = "0", alphaRaw] = match;
  let alpha = 1;
  if (alphaRaw !== undefined) {
    alpha = alphaRaw.endsWith("%") ? Number.parseFloat(alphaRaw) / 100 : Number.parseFloat(alphaRaw);
  }
  const base = `#${hex(Number(red))}${hex(Number(green))}${hex(Number(blue))}`;
  return alpha < 1 ? `${base}${hex(alpha * 255)}` : base;
}

function isTransparent(value: string): boolean {
  const color = toHexColor(value);
  return color === "" || color === "transparent" || /^#[0-9a-f]{6}00$/.test(color);
}

function firstFamily(value: string): string {
  const first = value.split(",")[0]?.trim() ?? "";
  return first.replace(/^["']|["']$/g, "");
}

function fontSummary(styles: ElementDetails["styles"]): string {
  if (styles.fontSize === "") return "";
  const lineHeight = styles.lineHeight === "" || styles.lineHeight === "normal" ? "" : `/${styles.lineHeight}`;
  const family = firstFamily(styles.fontFamily);
  const weight = styles.fontWeight === "" ? "" : `${styles.fontWeight} `;
  return `${weight}${styles.fontSize}${lineHeight}${family === "" ? "" : ` "${family}"`}`;
}

function isZeroBox(value: string): boolean {
  return value.split(/\s+/).every((part) => part === "0px" || part === "0");
}

function stylesLine(details: ElementDetails): string {
  const { styles } = details;
  const parts: string[] = [];
  if (styles.color !== "") parts.push(`color ${toHexColor(styles.color)}`);
  if (!isTransparent(styles.backgroundColor)) parts.push(`background ${toHexColor(styles.backgroundColor)}`);
  const font = fontSummary(styles);
  if (font !== "") parts.push(`font ${font}`);
  if (styles.padding !== "" && !isZeroBox(styles.padding)) parts.push(`padding ${styles.padding}`);
  if (styles.borderRadius !== "" && !isZeroBox(styles.borderRadius)) parts.push(`radius ${styles.borderRadius}`);
  return parts.join(" · ");
}

function componentPath(details: ElementDetails): string {
  if (details.component === null) return "";
  const path = [...details.component.ownerPath];
  if (path[path.length - 1] !== details.component.name) path.push(details.component.name);
  return path.join(" › ");
}

function sourceText(details: ElementDetails): string {
  if (details.source !== null) {
    return `\`${details.source.file}:${String(details.source.line)}:${String(details.source.column)}\``;
  }
  return details.sourceUnavailableReason === undefined
    ? ""
    : `unavailable (${UNAVAILABLE_REASONS[details.sourceUnavailableReason]})`;
}

function roleText(role: string | null, name: string): string {
  const parts = [role ?? "", name === "" ? "" : `"${name}"`].filter((part) => part !== "");
  return parts.join(" ");
}

function bullets(entries: readonly (readonly [string, string])[]): string[] {
  return entries.filter(([, value]) => value !== "").map(([label, value]) => `- ${label}: ${value}`);
}

function elementName(details: ElementDetails): string {
  return details.component?.name ?? (details.label === "" ? "Area" : details.label);
}

function elementBullets(details: ElementDetails): string[] {
  const { cssRect } = details;
  const box = `${String(Math.round(cssRect.width))}×${String(Math.round(cssRect.height))} at ${String(Math.round(cssRect.x))}, ${String(Math.round(cssRect.y))} (CSS px)`;
  return bullets([
    ["Source", sourceText(details)],
    ["Component", componentPath(details)],
    ["Selector", details.selector === "" ? "" : `\`${details.selector}\``],
    ["Text", details.text === "" ? "" : `"${details.text}"`],
    ["Role", roleText(details.role, details.accessibleName)],
    ["Box", box],
    ["Styles", stylesLine(details)],
    ["Classes", details.classes === "" ? "" : `\`${details.classes}\``],
  ]);
}

/** Markdown for one inspected element, as copied by the extension's C shortcut. */
export function buildElementMarkdown(details: ElementDetails, index?: number): string {
  const heading = `## ${index === undefined ? "" : `${String(index)}. `}${elementName(details)}`;
  return [heading, "", ...elementBullets(details)].join("\n") + "\n";
}

function areaListLine(details: ElementDetails): string {
  const parts = [`\`${elementName(details)}\``];
  if (details.source !== null) parts.push(`\`${details.source.file}:${String(details.source.line)}\``);
  const role = roleText(details.role, details.accessibleName);
  if (role !== "") parts.push(role);
  return `- ${parts.join(" · ")}`;
}

function noteSection(note: NoteMarkdownNote): string[] {
  const comment = note.comment.trim() === "" ? "_No comment_" : note.comment.trim();
  const first = note.details?.[0];
  const title = note.isArea || first === undefined ? (note.fallback?.name ?? "Area") : elementName(first);
  const lines = [`## ${String(note.number)}. ${title === "" ? "Area" : title}`, "", comment, ""];
  if (note.details !== null && first !== undefined) {
    if (note.isArea) {
      lines.push("### Elements in this area", ...note.details.slice(0, 20).map(areaListLine));
    } else {
      lines.push(...elementBullets(first));
    }
  } else if (note.fallback !== null) {
    const { role, name, box } = note.fallback;
    lines.push(
      ...bullets([
        ["Role", roleText(role, name)],
        [
          "Box",
          box === null
            ? ""
            : `${String(Math.round(box.width))}×${String(Math.round(box.height))} at ${String(Math.round(box.x))}, ${String(Math.round(box.y))} (screen px)`,
        ],
      ]),
    );
  }
  while (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** The Markdown handed to Claude: page, screenshot path, and one section per note pin. */
export function buildNoteMarkdown(input: NoteMarkdownInput): string {
  const title = input.pageTitle === null || input.pageTitle === "" ? "Screen capture" : input.pageTitle;
  const viewport =
    input.cssViewport === null
      ? ""
      : `${String(Math.round(input.cssViewport.width))}×${String(Math.round(input.cssViewport.height))} CSS px at ${String(input.cssViewport.devicePixelRatio)}×`;
  const header = [
    `# CapKit note: ${title}`,
    "",
    ...bullets([
      ["URL", input.pageUrl ?? ""],
      ["Captured", `${formatLocal(input.capturedAt, input.utcOffsetMinutes)} (${formatUtc(input.capturedAt)})`],
      ["Screenshot", input.screenshotPath],
      ["Viewport", viewport],
      ["Element details", DETAIL_LABELS[input.detail]],
    ]),
  ];
  const sections = input.notes.map((note) => noteSection(note).join("\n"));
  return [header.join("\n"), ...sections].join("\n\n") + "\n";
}
