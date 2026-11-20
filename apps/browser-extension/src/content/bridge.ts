import { z } from "zod";
import { sourceUnavailableReasonSchema } from "@snaphub/devtools-protocol/protocol";

/** Attribute on the inspector host element carrying the per-injection channel name. */
export const CHANNEL_ATTRIBUTE = "data-capkit-channel";
/** Attribute placed on an element while the main world resolves it. */
export const TARGET_ATTRIBUTE = "data-capkit-target";
export const HOST_TAG = "capkit-inspector-host";

export const mainRequestSchema = z.strictObject({ id: z.string().min(1).max(40), target: z.string().min(1).max(40) });
export type MainRequest = z.infer<typeof mainRequestSchema>;

export const mainReplySchema = z.strictObject({
  id: z.string().min(1).max(40),
  component: z
    .strictObject({ name: z.string().max(80), ownerPath: z.array(z.string().max(80)).max(6) })
    .nullable(),
  source: z
    .strictObject({ file: z.string().max(400), line: z.number().int(), column: z.number().int() })
    .nullable(),
  reason: sourceUnavailableReasonSchema.optional(),
});
export type MainReply = z.infer<typeof mainReplySchema>;

export const replyEventName = (channel: string): string => `${channel}:reply`;

/** Parses a JSON string from the other world. The page can observe or spoof it, so it is validated. */
export function parseMainReply(raw: unknown): MainReply | null {
  if (typeof raw !== "string" || raw.length > 20_000) return null;
  try {
    const parsed = mainReplySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parseMainRequest(raw: unknown): MainRequest | null {
  if (typeof raw !== "string" || raw.length > 2_000) return null;
  try {
    const parsed = mainRequestSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
