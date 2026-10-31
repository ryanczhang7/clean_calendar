// The capture function's CORS answer (CAL-047 Contract Block 1). The browser
// sends an OPTIONS preflight before every cross-origin POST from the app; this
// module answers it, and its headers are spread into every other reply so the
// browser lets the app read them.
//
// Why a hand-written list rather than `import { corsHeaders } from
// "npm:@supabase/supabase-js/cors"`: that would add an npm dependency to
// deno.json and deno.lock for three strings. The list is pinned here against
// the installed SDK version and pinned again by cors_test.ts. When supabase-js
// is upgraded, re-read the SDK's list.

/** The one origin value. See CAL-047 Notes, "Origin decision": `*`, never an echo. */
export const ALLOWED_ORIGIN = "*";

/**
 * Every request header supabase-js 2.117.3 can send to a function, as listed
 * by the SDK's own `@supabase/supabase-js/cors` module (SUPABASE_HEADERS in
 * node_modules/.pnpm/@supabase+supabase-js@2.117.3/.../dist/cors.mjs), which
 * the SDK keeps in sync with what it sends. Four of them are in the measured
 * preflight; the other four are sent only on retries or with tracing on, and
 * refusing them would be this bug again the day one appears.
 */
export const ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-retry-count",
  "traceparent",
  "tracestate",
  "baggage",
] as const;

/**
 * The function accepts POST; OPTIONS is the preflight itself. GET is not
 * listed: the handler answers it 405, and the CORS headers on that 405 are
 * what let the browser read it.
 */
export const ALLOWED_METHODS = ["POST", "OPTIONS"] as const;

/**
 * Lowercase keys; spread into every response the function builds.
 *
 * max-age 86400 is "cache the preflight for a day". Chromium caps it at 7200
 * and Firefox at 86400, so in practice it is one preflight per tab per one to
 * two hours rather than one per capture. A wrong value cannot break anything,
 * only cost a preflight.
 */
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  "access-control-allow-origin": ALLOWED_ORIGIN,
  "access-control-allow-headers": ALLOWED_HEADERS.join(", "),
  "access-control-allow-methods": ALLOWED_METHODS.join(", "),
  "access-control-max-age": "86400",
};

/**
 * The preflight reply when `req.method === "OPTIONS"`: status 204, empty
 * body, exactly CORS_HEADERS. Null for every other method. Reads nothing
 * from the request: no Origin check (the origin is `*`), no body, no auth.
 *
 * 204 because a preflight has no body and supabase-js never sees it (the
 * browser consumes it); any 2xx satisfies the browser, and 204 says so. A new
 * Response per call, so no caller can consume another's.
 */
export function preflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
}
