import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  type CaptureResponse,
  captureResponseSchema,
} from "../../shared/captureSchema";
import type { Database } from "../data/database.types";
import { supabase } from "../lib/supabase";

// The capture function's client (CAL-020 Contract, Block 1). One call to the
// `capture` Edge Function through supabase-js, which adds the session's
// bearer. Never throws: every reply is one of the outcomes below.

export type CaptureInput = { text: string } | { image: string; mime: string };

export type CaptureErrorCode =
  | "upstream"
  | "unreadable"
  | "bad_request"
  | "payload_too_large"
  | "unsupported_media_type"
  | "forbidden"
  | "unauthorized"
  | "unknown";

export type CaptureOutcome =
  | { status: "ok"; response: CaptureResponse }
  /** navigator.onLine false, or the fetch threw. */
  | { status: "offline" }
  | { status: "error"; code: CaptureErrorCode; http?: number };

/** What /capture hands /capture/confirm in router state (PO decision 3). */
export type CaptureSource =
  | { kind: "text"; text: string }
  | { kind: "image"; dataUrl: string; mime: string };
export type CaptureHandoff = {
  response: CaptureResponse;
  source: CaptureSource;
};

const KNOWN_CODES: ReadonlySet<string> = new Set<CaptureErrorCode>([
  "upstream",
  "unreadable",
  "bad_request",
  "payload_too_large",
  "unsupported_media_type",
  "forbidden",
  "unauthorized",
]);

/** The function's `{error}` code, when the body is JSON naming a known one. */
async function codeFrom(response: Response): Promise<CaptureErrorCode> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const code = body.error;
      if (typeof code === "string" && KNOWN_CODES.has(code)) {
        return code as CaptureErrorCode;
      }
    }
  } catch {
    // Not JSON (a gateway page): the code is unknown.
  }
  return "unknown";
}

export async function proposeEvent(
  input: CaptureInput,
  client: SupabaseClient<Database> = supabase,
): Promise<CaptureOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { status: "offline" };
  }
  const { data, error } = await client.functions.invoke("capture", {
    body: input,
  });
  if (error instanceof FunctionsRelayError) {
    const response = error.context as Response;
    return { status: "error", code: "upstream", http: response.status };
  }
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    return {
      status: "error",
      code: await codeFrom(response),
      http: response.status,
    };
  }
  if (error instanceof FunctionsFetchError) return { status: "offline" };
  if (error !== null) return { status: "error", code: "unknown" };
  const parsed = captureResponseSchema.safeParse(data);
  if (!parsed.success) return { status: "error", code: "unreadable" };
  return { status: "ok", response: parsed.data };
}
