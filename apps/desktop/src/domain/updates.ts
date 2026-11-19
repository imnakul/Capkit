import { z } from "zod";

/** Mirrors `UpdateStatusDto` in `services/updates.rs`. */
export const updateStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unsupported") }),
  z.object({ state: z.literal("idle") }),
  z.object({ state: z.literal("checking") }),
  z.object({ state: z.literal("up-to-date"), currentVersion: z.string() }),
  z.object({
    state: z.literal("available"),
    currentVersion: z.string(),
    version: z.string(),
    notes: z.string().nullable(),
  }),
  z.object({ state: z.literal("installing"), version: z.string(), percent: z.number().int().min(0).max(100) }),
  z.object({ state: z.literal("error"), currentVersion: z.string(), message: z.string() }),
]);

export type UpdateStatus = z.infer<typeof updateStatusSchema>;

/** Shown when an install is refused because a capture or recording is running. */
export const updateGuardMessage = "Finish your capture or recording first.";
