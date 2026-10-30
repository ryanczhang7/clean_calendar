import { assert, assertEquals } from "@std/assert";
import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  ALLOWED_ORIGIN,
  CORS_HEADERS,
  preflight,
} from "./cors.ts";

// CAL-047 Contract Block 1. Every value here is SETTLED by the contract and
// read out of it, never derived from the SDK at test time: the origin `*`, the
// eight header names supabase-js 2.117.3 can send (its own
// `@supabase/supabase-js/cors` SUPABASE_HEADERS, same order), POST and
// OPTIONS, a max-age of 86400, and 204 for the preflight.

const URL_ = "http://127.0.0.1:54321/functions/v1/capture";

const EIGHT = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-retry-count",
  "traceparent",
  "tracestate",
  "baggage",
];

/** The browser's preflight as measured against the hosted project (Context). */
function browserPreflight(): Request {
  return new Request(URL_, {
    method: "OPTIONS",
    headers: {
      origin: "https://clean-calendar.pages.dev",
      "access-control-request-method": "POST",
      "access-control-request-headers":
        "authorization,apikey,content-type,x-client-info",
    },
  });
}

Deno.test("the allowed origin is the wildcard *, never an echo of the caller's origin", () => {
  assertEquals(ALLOWED_ORIGIN, "*");
});

Deno.test("the allowed headers are the eight supabase-js 2.117.3 can send, in the SDK's order", () => {
  assertEquals([...ALLOWED_HEADERS], EIGHT);
});

Deno.test("the allowed methods are POST and OPTIONS, and not GET", () => {
  assertEquals([...ALLOWED_METHODS], ["POST", "OPTIONS"]);
});

Deno.test("CORS_HEADERS is exactly the four lowercase access-control headers with the contract's values", () => {
  assertEquals({ ...CORS_HEADERS }, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400",
  });
});

Deno.test("the allow-headers value, split on ', ', is ALLOWED_HEADERS in order", () => {
  assertEquals(
    CORS_HEADERS["access-control-allow-headers"]!.split(", "),
    [...ALLOWED_HEADERS],
  );
});

Deno.test("the browser's preflight is answered 204 with an empty body", async () => {
  const res = preflight(browserPreflight());
  assert(res !== null, "an OPTIONS request got null, not a preflight reply");
  assertEquals(res.status, 204);
  assertEquals(await res.text(), "");
});

Deno.test("the preflight reply carries allow-origin *, the eight allowed headers, POST, OPTIONS and a one-day max-age", () => {
  const res = preflight(browserPreflight());
  assert(res !== null, "an OPTIONS request got null, not a preflight reply");
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
  assertEquals(
    res.headers.get("access-control-allow-headers"),
    "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
  );
  assertEquals(
    res.headers.get("access-control-allow-methods"),
    "POST, OPTIONS",
  );
  assertEquals(res.headers.get("access-control-max-age"), "86400");
});

Deno.test("the preflight reply carries no other header: no credentials, no Vary: Origin, no content-type", () => {
  const res = preflight(browserPreflight());
  assert(res !== null, "an OPTIONS request got null, not a preflight reply");
  assertEquals([...res.headers.keys()].sort(), [
    "access-control-allow-headers",
    "access-control-allow-methods",
    "access-control-allow-origin",
    "access-control-max-age",
  ]);
});

Deno.test("a bare OPTIONS, with no Origin and no Access-Control-Request headers, is still a 204 preflight", () => {
  const res = preflight(new Request(URL_, { method: "OPTIONS" }));
  assert(res !== null, "a bare OPTIONS got null");
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});

Deno.test("a POST is not a preflight: preflight returns null", () => {
  const res = preflight(
    new Request(URL_, {
      method: "POST",
      headers: {
        origin: "https://clean-calendar.pages.dev",
        authorization: "Bearer owner-jwt",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "x" }),
    }),
  );
  assertEquals(res, null);
});

Deno.test("a GET is not a preflight: preflight returns null", () => {
  const res = preflight(
    new Request(URL_, {
      method: "GET",
      headers: { origin: "https://clean-calendar.pages.dev" },
    }),
  );
  assertEquals(res, null);
});

Deno.test("preflight does not read the POST body it declines, so the handler can still read it", async () => {
  const req = new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "x" }),
  });
  assertEquals(preflight(req), null);
  assertEquals(req.bodyUsed, false);
  assertEquals(await req.json(), { text: "x" });
});
