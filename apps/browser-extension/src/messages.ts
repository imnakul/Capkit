import { z } from "zod";
import {
  cssViewportSchema,
  elementDetailsSchema,
  hitElementSchema,
  physicalRectSchema,
  resultStatusSchema,
  sensitiveMatchSchema,
  viewportPointSchema,
} from "@snaphub/devtools-protocol/protocol";

/** The page tools. Only one runs at a time. */
export const toolSchema = z.enum(["inspect", "pick", "font", "color"]);
export type Tool = z.infer<typeof toolSchema>;

/** Messages from the background worker to the content script of a tab. */
export const pageRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("hitTest"), viewport: physicalRectSchema, point: viewportPointSchema }),
  z.strictObject({
    kind: z.literal("inspect"),
    viewport: physicalRectSchema,
    point: viewportPointSchema.optional(),
    area: physicalRectSchema.optional(),
  }),
  z.strictObject({ kind: z.literal("findSensitive"), viewport: physicalRectSchema, area: physicalRectSchema }),
  z.strictObject({ kind: z.literal("tool"), tool: toolSchema, action: z.enum(["toggle", "start"]) }),
  z.strictObject({ kind: z.literal("ping") }),
]);
export type PageRequest = z.infer<typeof pageRequestSchema>;

export const pageResponseSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("hitTest"), status: resultStatusSchema, elements: z.array(hitElementSchema) }),
  z.strictObject({
    kind: z.literal("inspect"),
    status: resultStatusSchema,
    cssViewport: cssViewportSchema.optional(),
    elements: z.array(elementDetailsSchema),
  }),
  z.strictObject({ kind: z.literal("findSensitive"), status: resultStatusSchema, matches: z.array(sensitiveMatchSchema) }),
  z.strictObject({ kind: z.literal("ok") }),
]);
export type PageResponse = z.infer<typeof pageResponseSchema>;

/** Messages from a content script or the popup to the background worker. */
export const backgroundRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("injectMain") }),
  z.strictObject({ kind: z.literal("captureVisible") }),
  z.strictObject({ kind: z.literal("status") }),
  z.strictObject({ kind: z.literal("pair"), code: z.string() }),
  z.strictObject({ kind: z.literal("retry") }),
  z.strictObject({ kind: z.literal("forget") }),
  z.strictObject({ kind: z.literal("startTool"), tool: toolSchema }),
  z.strictObject({ kind: z.literal("siteAccess"), tabId: z.number().int().optional() }),
]);
export type BackgroundRequest = z.infer<typeof backgroundRequestSchema>;

export const linkStateSchema = z.enum(["no-token", "connecting", "connected", "unreachable", "rejected"]);
export type LinkState = z.infer<typeof linkStateSchema>;

export const linkStatusSchema = z.strictObject({
  state: linkStateSchema,
  reason: z.string().optional(),
});
export type LinkStatus = z.infer<typeof linkStatusSchema>;

export const siteAccessSchema = z.strictObject({
  state: z.enum(["allowed", "needs-access", "unavailable"]),
  origin: z.string().optional(),
});
export type SiteAccess = z.infer<typeof siteAccessSchema>;

