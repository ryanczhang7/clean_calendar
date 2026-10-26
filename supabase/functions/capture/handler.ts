// The capture function (CAL-018 Contract Block 2): shared text in, a proposed
// event out. The order of the checks below IS the contract - nothing is fetched
// before the bearer and body checks, and Gemini is not called before the owner
// check passes. Every outbound call goes through deps.fetch.

import {
  type GeminiReply,
  geminiReplySchema,
} from "../../../shared/captureSchema.ts";
import { bearer, jsonResponse, requireOwner } from "../_shared/owner.ts";
import { callGemini, DEFAULT_GEMINI_API_BASE, GEMINI_MODEL } from "./gemini.ts";
import { buildPrompt } from "./prompt.ts";

export type CaptureDeps = {
  fetch: typeof fetch;
  env: (name: string) => string | undefined;
  now: () => number;
};

/** In UTF-16 code units (`String.length`), the client's measure. */
export const MAX_TEXT_CHARS = 20_000;

type JobRow = {
  input_kind: "text";
  input_hash: string;
  model: string;
  proposal: GeminiReply["proposal"] | null;
  confidence: GeminiReply["confidence"] | null;
  status: "proposed" | "discarded";
  error: string | null;
  latency_ms: number;
};

async function readText(req: Request): Promise<string | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  const text = (body as { text?: unknown } | null)?.text;
  if (typeof text !== "string") return null;
  if (text.trim() === "" || text.length > MAX_TEXT_CHARS) return null;
  return text;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
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
  const text = await readText(req);
  if (text === null) return jsonResponse({ error: "bad_request" }, 400);

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
    prompt: buildPrompt(text, kindNames),
    apiKey: deps.env("GEMINI_API_KEY") ?? "",
    base: deps.env("GEMINI_API_BASE") ?? DEFAULT_GEMINI_API_BASE,
    fetch: deps.fetch,
    now: deps.now,
  });

  const row: JobRow = {
    input_kind: "text",
    input_hash: await sha256Hex(text),
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

  // 8. The job row: a hash of the text, never the text.
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
