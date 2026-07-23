export const site = {
  name: "CapKit",
  tagline: "Capture, explain, and continue.",
  description:
    "A lightweight, always-available screenshot and visual communication utility for Windows. Frozen-screen capture, real annotation, and secure redaction — without opening another app.",
} as const;

export const nav = [
  { label: "Product", href: "#product" },
  { label: "Tools", href: "#tools" },
  { label: "Performance", href: "#performance" },
  { label: "Platforms", href: "#platforms" },
] as const;

export const heroStats = [
  { value: "~100ms", label: "shortcut to capture surface" },
  { value: "0%", label: "idle CPU, no polling loops" },
  { value: "<60MB", label: "installed, excluding captures" },
] as const;

export const positioning = [
  {
    tool: "Windows Snip",
    compare: "Matches its immediacy, adds the annotation, redaction, and pinning it leaves out.",
  },
  {
    tool: "Flameshot",
    compare: "Keeps contextual editing, improves visual polish, detection, and cross-platform consistency.",
  },
  {
    tool: "CleanShot",
    compare: "Adapts its capture-to-share philosophy, starting with a smaller local-first core.",
  },
  {
    tool: "ShareX",
    compare: "Doesn't compete on menu depth. Competes on speed, restraint, and predictable defaults.",
  },
] as const;

export const quickTools = [
  {
    id: "redact",
    title: "Secure redaction",
    mono: "BLUR / PIXELATE / BLACKOUT",
    description:
      "Blur, secure pixelation, and blackout that permanently rasterize protected pixels. Nothing recoverable ships in the export.",
  },
  {
    id: "annotate",
    title: "Rich annotation",
    mono: "ARROW / SHAPE / TEXT",
    description:
      "Grouped arrows, smooth curved lines, shapes, highlighter, and freehand pencil — contextual color, stroke, and fill controls appear only when you need them.",
  },
  {
    id: "counter",
    title: "Auto counter",
    mono: "1 → 2 → 3",
    description:
      "Numbered callouts that increment automatically, with an explicit starting value for step-by-step walkthroughs.",
  },
  {
    id: "pin",
    title: "Pin anywhere",
    mono: "ALWAYS ON TOP",
    description:
      "Turn a capture into a resizable, click-through, always-on-top reference image without leaving your desktop.",
  },
  {
    id: "scroll",
    title: "Scrolling capture",
    mono: "AUTO / MANUAL",
    description:
      "Automatic overlap stitching with sticky-header handling, or a manual fallback for apps that ignore synthetic scroll input.",
  },
] as const;

export const performanceStats = [
  { value: "100ms", unit: "median", label: "Shortcut to visible capture surface" },
  { value: "0", unit: "% idle CPU", label: "No polling loops, ever" },
  { value: "25–35", unit: "MB idle", label: "Resident memory footprint" },
  { value: "<60", unit: "MB installed", label: "Excluding your captures" },
] as const;

export const principles = [
  { title: "Stay in context", body: "Never navigate into an application for routine capture." },
  { title: "One obvious action", body: "Default behavior works before any customization." },
  { title: "Depth on demand", body: "Contextual controls appear after you choose a tool." },
  { title: "Local by default", body: "Capture and editing work offline, without an account." },
  { title: "Redaction must be real", body: "Protected pixels can't be recovered from an export." },
] as const;

export const platforms = [
  { name: "Windows 11", status: "Confirmed" as const, note: "Reference implementation, physically tested." },
  { name: "macOS", status: "Provisional" as const, note: "Architectural target, native adapters pending." },
  { name: "Ubuntu", status: "Provisional" as const, note: "Wayland portal-mediated capture planned." },
  { name: "Fedora", status: "Provisional" as const, note: "Shares the Linux capture/domain core." },
] as const;

export const footerLinks = {
  product: [
    { label: "Quick tools", href: "#tools" },
    { label: "Performance", href: "#performance" },
    { label: "Platform status", href: "#platforms" },
  ],
  project: [
    // TODO: wire to the public repository once it's published.
    { label: "Source on GitHub", href: "#" },
    { label: "Roadmap", href: "#platforms" },
  ],
} as const;
