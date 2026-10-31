// The Gemini client (CAL-018 Contract Block 3): REST generateContent with a
// JSON response schema, through an injected fetch. The key travels only in the
// x-goog-api-key header - never in a URL, a log line, an error or a job row.

export const GEMINI_MODEL = "gemini-3.8-flash";
export const DEFAULT_GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com";

export function geminiUrl(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return `${trimmed}/v1beta/models/${GEMINI_MODEL}:generateContent`;
}

const FIELDS = ["title", "startsAt", "endsAt", "location", "kind"];

const nullableString = { type: "STRING", nullable: true };
const rating = { type: "NUMBER", minimum: 0, maximum: 1 };

/**
 * The OpenAPI-subset mirror of `geminiReplySchema` in
 * shared/captureSchema.ts. The model is held to it; the zod schema still
 * validates the reply, because this one is advisory to the model.
 */
export const geminiResponseSchema: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    proposal: {
      type: "OBJECT",
      properties: {
        title: nullableString,
        startsAt: nullableString,
        endsAt: nullableString,
        allDay: { type: "BOOLEAN" },
        location: nullableString,
        kindName: nullableString,
      },
      required: [
        "title",
        "startsAt",
        "endsAt",
        "allDay",
        "location",
        "kindName",
      ],
    },
    confidence: {
      type: "OBJECT",
      properties: Object.fromEntries(FIELDS.map((f) => [f, rating])),
    },
    missing: {
      type: "ARRAY",
      items: { type: "STRING", enum: FIELDS },
    },
  },
  required: ["proposal", "confidence", "missing"],
};

/** An image sent inline (CAL-019 Block 2); `data` is the base64 as received. */
export type InlineImage = { mimeType: string; data: string };

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export type GeminiRequest = {
  contents: [{ role: "user"; parts: GeminiPart[] }];
  generationConfig: {
    responseMimeType: "application/json";
    responseSchema: typeof geminiResponseSchema;
    temperature: 1;
  };
};

/** With an image, the image part comes first, then the prompt. */
export function buildGeminiRequest(
  prompt: string,
  image?: InlineImage,
): GeminiRequest {
  const parts: GeminiPart[] = image === undefined ? [{ text: prompt }] : [
    { inline_data: { mime_type: image.mimeType, data: image.data } },
    { text: prompt },
  ];
  return {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: geminiResponseSchema,
      temperature: 1,
    },
  };
}

export type GeminiOutcome =
  | { kind: "reply"; text: string; latencyMs: number }
  | { kind: "http"; status: number; latencyMs: number }
  | { kind: "network"; latencyMs: number };

/** `candidates[0].content.parts[0].text`, or "" when any step is absent. */
function replyText(body: unknown): string {
  const candidates = (body as { candidates?: unknown } | null)?.candidates;
  if (!Array.isArray(candidates)) return "";
  const parts = (candidates[0] as { content?: { parts?: unknown } } | undefined)
    ?.content?.parts;
  if (!Array.isArray(parts)) return "";
  const text = (parts[0] as { text?: unknown } | undefined)?.text;
  return typeof text === "string" ? text : "";
}

export async function callGemini(args: {
  prompt: string;
  image?: InlineImage;
  apiKey: string;
  base: string;
  fetch: typeof fetch;
  now: () => number;
}): Promise<GeminiOutcome> {
  const started = args.now();
  let res: Response;
  try {
    res = await args.fetch(geminiUrl(args.base), {
      method: "POST",
      headers: {
        "x-goog-api-key": args.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildGeminiRequest(args.prompt, args.image)),
    });
  } catch {
    return { kind: "network", latencyMs: args.now() - started };
  }
  const latencyMs = args.now() - started;
  if (!res.ok) {
    await res.body?.cancel();
    return { kind: "http", status: res.status, latencyMs };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { kind: "reply", text: replyText(body), latencyMs };
}
