// The capture function (CAL-018 Contract Block 2, CAL-019 Block 1): shared
// text or a screenshot in, a proposed event out. The order of the checks below IS the contract - nothing is fetched
// before the bearer and body checks, and Gemini is not called before the owner
// check passes. Every outbound call goes through deps.fetch.

import {
  type GeminiReply,
  geminiReplySchema,
} from "../../../shared/captureSchema.ts";
import { preflight } from "../_shared/cors.ts";
import { bearer, jsonResponse, requireOwner } from "../_shared/owner.ts";
import { callGemini, DEFAULT_GEMINI_API_BASE, GEMINI_MODEL } from "./gemini.ts";
import { buildImagePrompt, buildPrompt } from "./prompt.ts";

export type CaptureDeps = {
  fetch: typeof fetch;
  env: (name: string) => string | undefined;
  now: () => number;
};

/** In UTF-16 code units (`String.length`), the client's measure. */
export const MAX_TEXT_CHARS = 20_000;

/** Decoded bytes (CAL-019 PO decision 4): this many passes, one more is 413. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Exact and lowercase, no parameters (CAL-019 PO decision 5). */
export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

type JobRow = {
  input_kind: "text" | "image";
  input_hash: string;
  model: string;
  proposal: GeminiReply["proposal"] | null;
  confidence: GeminiReply["confidence"] | null;
  status: "proposed" | "discarded";
  error: string | null;
  latency_ms: number;
};

type Input =
  | { kind: "text"; text: string }
  | {
    kind: "image";
    mimeType: string;
    data: string;
    bytes: Uint8Array<ArrayBuffer>;
  };

function isBase64Char(c: number): boolean {
  return (c >= 65 && c <= 90) || // A-Z
    (c >= 97 && c <= 122) || // a-z
    (c >= 48 && c <= 57) || // 0-9
    c === 43 || c === 47; // + /
}

/**
 * Strict standard base64 (CAL-019 PO decision 6), the same language as
 * `^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$` on a
 * non-empty string: a length that is a multiple of four, at most two `=` and
 * only at the end, the standard alphabet everywhere else. A scan rather than
 * that regex, because V8 overflows its stack backtracking the repeated group
 * over a 5.6 MB input. The platform decoders skip whitespace and accept "",
 * so this runs before decoding.
 */
function isStrictBase64(data: string): boolean {
  if (data.length === 0 || data.length % 4 !== 0) return false;
  let end = data.length;
  if (data.charCodeAt(end - 1) === 61) end--; // =
  if (data.charCodeAt(end - 1) === 61) end--;
  for (let i = 0; i < end; i++) {
    if (!isBase64Char(data.charCodeAt(i))) return false;
  }
  return true;
}

function decodeBase64(data: string): Uint8Array<ArrayBuffer> | null {
  if (!isStrictBase64(data)) return null;
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The body, as an Input or as the refusal it earns. An `image` key, whatever
 * its value, takes the image path and `text` is ignored (CAL-019 AC-3). The
 * image checks run in PO decision 7's order: string, MIME, base64, size.
 */
async function readInput(req: Request): Promise<Input | Response> {
  const badRequest = () => jsonResponse({ error: "bad_request" }, 400);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const fields = (typeof body === "object" && body !== null ? body : {}) as {
    text?: unknown;
    image?: unknown;
    mime?: unknown;
  };

  if (Object.hasOwn(fields, "image")) {
    const { image, mime } = fields;
    if (typeof image !== "string") return badRequest();
    if (
      typeof mime !== "string" ||
      !(IMAGE_MIME_TYPES as readonly string[]).includes(mime)
    ) {
      return jsonResponse({ error: "unsupported_media_type" }, 415);
    }
    const bytes = decodeBase64(image);
    if (bytes === null) return badRequest();
    if (bytes.length > MAX_IMAGE_BYTES) {
      return jsonResponse({ error: "payload_too_large" }, 413);
    }
    return { kind: "image", mimeType: mime, data: image, bytes };
  }

  const text = fields.text;
  if (typeof text !== "string") return badRequest();
  if (text.trim() === "" || text.length > MAX_TEXT_CHARS) return badRequest();
  return { kind: "text", text };
}

/** Lowercase SHA-256 hex of the bytes; text is hashed as its UTF-8. */
async function sha256Hex(
  input: string | Uint8Array<ArrayBuffer>,
): Promise<string> {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : input;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(digest),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}

function normalise(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * AC-2: a kindName the owner has no live kind for becomes null and "kind" is
 * missing; a match (case-insensitive, trimmed) takes the stored spelling.
 * `missing` keeps its order and loses duplicates.
 */
function mapKind(
  reply: GeminiReply,
  kindNames: readonly string[],
): GeminiReply {
  const missing = [...new Set(reply.missing)];
  const said = reply.proposal.kindName;
  if (said === null) return { ...reply, missing };
  const stored = kindNames.find((k) => normalise(k) === normalise(said));
  if (stored !== undefined) {
    return {
      ...reply,
      proposal: { ...reply.proposal, kindName: stored },
      missing,
    };
  }
  if (!missing.includes("kind")) missing.push("kind");
  return { ...reply, proposal: { ...reply.proposal, kindName: null }, missing };
}

function unreadableReason(replyText: string): string | GeminiReply {
  let parsed: unknown;
  try {
    parsed = JSON.parse(replyText);
  } catch {
    return "unreadable: not json";
  }
  const result = geminiReplySchema.safeParse(parsed);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.map(String).join(".") ?? "";
  return `unreadable: ${path === "" ? "(root)" : path}: ${
    issue?.message ?? "invalid"
  }`;
}

export async function handleCapture(
  req: Request,
  deps: CaptureDeps,
): Promise<Response> {
  // 0. The browser's CORS preflight, before anything else is read.
  const pre = preflight(req);
  if (pre !== null) return pre;
  // 1. Method.
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }
  // 2. A bearer token, before anything is read or fetched.
  const authorization = bearer(req);
  if (authorization === null) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  // 3. The body. Nothing attempted, so no job row (PO decision 3).
  const input = await readInput(req);
  if (input instanceof Response) return input;

  // 4. The owner.
  const refused = await requireOwner(req, deps);
  if (refused !== null) return refused;

  const supabaseUrl = deps.env("SUPABASE_URL");
  const rest = {
    apikey: deps.env("SUPABASE_ANON_KEY") ?? "",
    authorization,
  };
  const upstream = () => jsonResponse({ error: "upstream" }, 502);

  // 5. The owner's live kind names; RLS scopes the read.
  let kindNames: string[];
  try {
    const query = new URLSearchParams({
      select: "name",
      deleted_at: "is.null",
      order: "sort_order.asc",
    });
    const res = await deps.fetch(`${supabaseUrl}/rest/v1/kinds?${query}`, {
      method: "GET",
      headers: rest,
    });
    if (!res.ok) return upstream();
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return upstream();
    kindNames = rows
      .map((r) => (r as { name?: unknown } | null)?.name)
      .filter((n): n is string => typeof n === "string");
  } catch {
    return upstream();
  }

  // 6. Gemini, timed around the one call.
  const outcome = await callGemini({
    ...(input.kind === "image"
      ? {
        prompt: buildImagePrompt(kindNames),
        image: { mimeType: input.mimeType, data: input.data },
      }
      : { prompt: buildPrompt(input.text, kindNames) }),
    apiKey: deps.env("GEMINI_API_KEY") ?? "",
    base: deps.env("GEMINI_API_BASE") ?? DEFAULT_GEMINI_API_BASE,
    fetch: deps.fetch,
    now: deps.now,
  });

  const row: JobRow = {
    input_kind: input.kind,
    input_hash: await sha256Hex(
      input.kind === "image" ? input.bytes : input.text,
    ),
    model: GEMINI_MODEL,
    proposal: null,
    confidence: null,
    status: "discarded",
    error: null,
    latency_ms: Math.round(outcome.latencyMs),
  };
  let failure: Response | null = null;
  let reply: GeminiReply | null = null;

  if (outcome.kind === "network") {
    row.error = "upstream fetch";
    failure = upstream();
  } else if (outcome.kind === "http") {
    row.error = `upstream ${outcome.status}`;
    failure = upstream();
  } else {
    const read = unreadableReason(outcome.text);
    if (typeof read === "string") {
      row.error = read;
      failure = jsonResponse({ error: "unreadable" }, 502);
    } else {
      // 7. Map the kind against the live names.
      reply = mapKind(read, kindNames);
      row.proposal = reply.proposal;
      row.confidence = reply.confidence;
      row.status = "proposed";
    }
  }

  // 8. The job row: a hash of the text or the decoded image bytes, never
  // the input itself.
  let jobId: unknown;
  try {
    const res = await deps.fetch(`${supabaseUrl}/rest/v1/capture_jobs`, {
      method: "POST",
      headers: {
        ...rest,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    if (res.ok) {
      const rows: unknown = await res.json();
      jobId = Array.isArray(rows)
        ? (rows[0] as { id?: unknown } | undefined)?.id
        : undefined;
    }
  } catch {
    jobId = undefined;
  }

  if (failure !== null) return failure;
  if (typeof jobId !== "string" || reply === null) return upstream();

  // 9. The proposal.
  return jsonResponse({ ...reply, jobId }, 200);
}
