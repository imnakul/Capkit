import { z } from "zod";

export const PROTOCOL_VERSION = 1;
export const LINK_PORTS = [47811, 47812, 47813] as const;
export const MAX_MESSAGE_BYTES = 256 * 1024;

const envelope = { v: z.literal(PROTOCOL_VERSION) };

/** Physical screen pixels. */
export const physicalRectSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type PhysicalRect = z.infer<typeof physicalRectSchema>;

/** Physical pixels relative to the page viewport's top-left. */
export const viewportRectSchema = physicalRectSchema;
export type ViewportRect = PhysicalRect;

export const viewportPointSchema = z.strictObject({ x: z.number(), y: z.number() });
export type ViewportPoint = z.infer<typeof viewportPointSchema>;

export const browserInfoSchema = z.strictObject({
  name: z.string().min(1).max(60),
  version: z.string().max(40),
});
export type BrowserInfo = z.infer<typeof browserInfoSchema>;

export const sensitiveKindSchema = z.enum(["token", "card", "email", "phone", "secret", "password"]);

const tabSchema = z.strictObject({ url: z.string().max(4096), title: z.string().max(500) });
export type TabInfo = z.infer<typeof tabSchema>;

export const resultStatusSchema = z.enum(["ok", "no-tab", "no-access", "mismatch", "error"]);
export type ResultStatus = z.infer<typeof resultStatusSchema>;

export const hitElementSchema = z.strictObject({
  key: z.string().max(120),
  label: z.string().max(80),
  rect: viewportRectSchema,
});
export type HitElement = z.infer<typeof hitElementSchema>;

export const sourceUnavailableReasonSchema = z.enum([
  "no-react",
  "production-build",
  "no-source-map",
  "fetch-failed",
]);

export const elementDetailsSchema = z.strictObject({
  label: z.string().max(80),
  tag: z.string().max(40),
  role: z.string().max(60).nullable(),
  accessibleName: z.string().max(120),
  text: z.string().max(200),
  selector: z.string().max(300),
  component: z
    .strictObject({ name: z.string().max(80), ownerPath: z.array(z.string().max(80)).max(6) })
    .nullable(),
  source: z
    .strictObject({ file: z.string().max(400), line: z.number().int(), column: z.number().int() })
    .nullable(),
  sourceUnavailableReason: sourceUnavailableReasonSchema.optional(),
  classes: z.string().max(400),
  styles: z.strictObject({
    color: z.string().max(120),
    backgroundColor: z.string().max(120),
    fontFamily: z.string().max(120),
    fontSize: z.string().max(120),
    fontWeight: z.string().max(120),
    lineHeight: z.string().max(120),
    padding: z.string().max(120),
    margin: z.string().max(120),
    borderRadius: z.string().max(120),
    boxShadow: z.string().max(120),
    display: z.string().max(120),
    gap: z.string().max(120),
  }),
  cssRect: physicalRectSchema,
  rect: viewportRectSchema,
});
export type ElementDetails = z.infer<typeof elementDetailsSchema>;

export const cssViewportSchema = z.strictObject({
  width: z.number(),
  height: z.number(),
  devicePixelRatio: z.number(),
});
export type CssViewport = z.infer<typeof cssViewportSchema>;

const requestBase = {
  ...envelope,
  id: z.string().min(1).max(80),
  windowTitle: z.string().max(500),
  viewport: physicalRectSchema,
};

// Extension → CapKit.
export const pairMessageSchema = z.strictObject({
  ...envelope,
  type: z.literal("pair"),
  code: z.string().regex(/^\d{6}$/),
  browser: browserInfoSchema,
  extensionVersion: z.string().max(40),
});
export const helloMessageSchema = z.strictObject({
  ...envelope,
  type: z.literal("hello"),
  token: z.string().min(43).max(64),
  browser: browserInfoSchema,
  extensionVersion: z.string().max(40),
});
export const pingMessageSchema = z.strictObject({ ...envelope, type: z.literal("ping") });
export const hitTestResultSchema = z.strictObject({
  ...envelope,
  type: z.literal("hitTestResult"),
  id: z.string().min(1).max(80),
  status: resultStatusSchema,
  tab: tabSchema.optional(),
  elements: z.array(hitElementSchema).max(12),
});
export const inspectResultSchema = z.strictObject({
  ...envelope,
  type: z.literal("inspectResult"),
  id: z.string().min(1).max(80),
  status: resultStatusSchema,
  tab: tabSchema.optional(),
  cssViewport: cssViewportSchema.optional(),
  elements: z.array(elementDetailsSchema).max(20),
});
export const sensitiveMatchSchema = z.strictObject({
  kind: sensitiveKindSchema,
  preview: z.string().max(80),
  rects: z.array(viewportRectSchema).max(40),
});
export type SensitiveMatch = z.infer<typeof sensitiveMatchSchema>;
export const findSensitiveResultSchema = z.strictObject({
  ...envelope,
  type: z.literal("findSensitiveResult"),
  id: z.string().min(1).max(80),
  status: resultStatusSchema,
  matches: z.array(sensitiveMatchSchema).max(200),
});

export const extensionMessageSchema = z.discriminatedUnion("type", [
  pairMessageSchema,
  helloMessageSchema,
  pingMessageSchema,
  hitTestResultSchema,
  inspectResultSchema,
  findSensitiveResultSchema,
]);
export type ExtensionMessage = z.infer<typeof extensionMessageSchema>;

// CapKit → extension.
export const pairRejectReasonSchema = z.enum([
  "wrong-code",
  "expired",
  "too-many-attempts",
  "not-pairing",
]);
export type PairRejectReason = z.infer<typeof pairRejectReasonSchema>;

export const pairedMessageSchema = z.strictObject({
  ...envelope,
  type: z.literal("paired"),
  token: z.string().min(43).max(64),
});
export const pairRejectedMessageSchema = z.strictObject({
  ...envelope,
  type: z.literal("pairRejected"),
  reason: pairRejectReasonSchema,
});
/** CapKit's theme accent, so the extension matches the colour chosen in CapKit. */
export const accentSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const readyMessageSchema = z.strictObject({ ...envelope, type: z.literal("ready"), accent: accentSchema.optional() });
export const themeMessageSchema = z.strictObject({ ...envelope, type: z.literal("theme"), accent: accentSchema });
export const helloRejectedMessageSchema = z.strictObject({
  ...envelope,
  type: z.literal("helloRejected"),
  reason: z.literal("unknown-token"),
});
export const pongMessageSchema = z.strictObject({ ...envelope, type: z.literal("pong") });
export const hitTestMessageSchema = z.strictObject({
  ...requestBase,
  type: z.literal("hitTest"),
  point: viewportPointSchema,
});
export const inspectMessageSchema = z
  .strictObject({
    ...requestBase,
    type: z.literal("inspect"),
    point: viewportPointSchema.optional(),
    area: viewportRectSchema.optional(),
  })
  .refine((message) => (message.point === undefined) !== (message.area === undefined), {
    message: "inspect needs exactly one of point or area",
  });
export const findSensitiveMessageSchema = z.strictObject({
  ...requestBase,
  type: z.literal("findSensitive"),
  area: viewportRectSchema,
});

export const appMessageSchema = z.union([
  pairedMessageSchema,
  pairRejectedMessageSchema,
  readyMessageSchema,
  themeMessageSchema,
  helloRejectedMessageSchema,
  pongMessageSchema,
  hitTestMessageSchema,
  inspectMessageSchema,
  findSensitiveMessageSchema,
]);
export type AppMessage = z.infer<typeof appMessageSchema>;

/** Parses one text frame from CapKit. Returns null for oversize, non-JSON or invalid frames. */
export function parseAppMessage(raw: string): AppMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  try {
    const parsed = appMessageSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Parses one text frame from the extension (used by tests and fake clients). */
export function parseExtensionMessage(raw: string): ExtensionMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  try {
    const parsed = extensionMessageSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
