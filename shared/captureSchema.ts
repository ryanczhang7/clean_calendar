import { z } from "zod";

/**
 * The capture vocabulary (CAL-018). `missing` and `confidence` name fields in
 * these terms; the proposal carries the kind as `kindName`.
 */
export const CAPTURE_FIELDS = [
  "title",
  "startsAt",
  "endsAt",
  "location",
  "kind",
] as const;
export type CaptureField = (typeof CAPTURE_FIELDS)[number];

const captureField = z.enum(CAPTURE_FIELDS);

/** The proposed event. Strict: an extra key is a reply we cannot read. */
export const proposalSchema = z
  .object({
    title: z.string().nullable(),
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
    allDay: z.boolean(),
    location: z.string().nullable(),
    kindName: z.string().nullable(),
  })
  .strict();

/**
 * 0..1 per field, every key optional. `partialRecord`, because zod 4's
 * `record` over an enum key requires every key.
 */
export const confidenceSchema = z.partialRecord(
  captureField,
  z.number().min(0).max(1),
);

export const missingSchema = z.array(captureField);

/** What the model must return (the Gemini responseSchema mirrors this). */
export const geminiReplySchema = z.object({
  proposal: proposalSchema,
  confidence: confidenceSchema,
  missing: missingSchema,
});

/** What the function returns to the client. */
export const captureResponseSchema = geminiReplySchema.extend({
  jobId: z.string().uuid(),
});

export type Proposal = z.infer<typeof proposalSchema>;
export type GeminiReply = z.infer<typeof geminiReplySchema>;
export type CaptureResponse = z.infer<typeof captureResponseSchema>;
