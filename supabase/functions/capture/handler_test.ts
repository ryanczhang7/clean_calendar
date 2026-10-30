import { assert, assertEquals, assertMatch } from "@std/assert";
import { handleCapture, MAX_TEXT_CHARS } from "./handler.ts";

// CAL-018 Contract Block 2 (AC-1 to AC-6). Every outbound call goes through
// deps.fetch, and the stub here answers from a routing table keyed by
// "METHOD origin+path". A URL the table does not hold is RECORDED as unexpected
// and then thrown - recorded, because the handler is allowed to catch a throw
// (a Gemini network failure is a 502, not a crash), and a swallowed throw must
// still fail the test. Every scenario asserts the exact sequence of calls.
//
// Settled values are read out of the Contract, never calibrated: the URLs, the
// status codes and error strings per step, the 20,000-unit limit, the SHA-256
// vectors (computed with `sha256sum`, independent of crypto.subtle).

const SUPABASE_URL = "http://127.0.0.1:54321";
const GEMINI_BASE = "http://127.0.0.1:9999";
const ANON = "anon-key-test";
const GEMINI_KEY = "gem-key-test-5f3a9c";
const OWNER_JWT = "Bearer owner-jwt";
const JOB_ID = "3f1c9a52-6b7e-4d2a-9c11-0a5b2e7d8f40";
const KIND_NAMES = ["Work", "Doctor", "Family"];

const OWNER = `POST ${SUPABASE_URL}/rest/v1/rpc/is_owner`;
const KINDS = `GET ${SUPABASE_URL}/rest/v1/kinds`;
const GEMINI =
  `POST ${GEMINI_BASE}/v1beta/models/gemini-2.5-flash:generateContent`;
const JOBS = `POST ${SUPABASE_URL}/rest/v1/capture_jobs`;

const TEXT =
  "Hi Sam, your dentist check-up is booked for Tuesday 3 November at 09:30, " +
  "12 High Street. Reply to change it. Ref QX-77812";

const GOOD_REPLY = {
  proposal: {
    title: "Dentist check-up",
    startsAt: "2026-11-03T09:30:00",
    endsAt: null,
    allDay: false,
    location: "12 High Street",
    kindName: "Doctor",
  },
  confidence: { title: 0.9, startsAt: 0.85, location: 0.8, kind: 0.6 },
  missing: ["endsAt"],
};

type Call = {
  key: string;
  url: URL;
  headers: Headers;
  body: string;
};

type Route = (call: Call) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Gemini's generateContent envelope around one text part. */
function geminiEnvelope(text: string): Response {
  return json({
    candidates: [
      {
        content: { role: "model", parts: [{ text }] },
        finishReason: "STOP",
      },
    ],
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 60 },
  });
}

type WorldOptions = {
  owner?: Route;
  kinds?: Route;
  gemini?: Route;
  jobs?: Route;
  env?: Record<string, string | undefined>;
  geminiKey?: string;
};

/**
 * One fake world: the routing table, the env table, and a clock that moves
 * ONLY while Gemini is being called, by 1234.6 ms - so latency_ms is 1235
 * however many times the handler reads the clock elsewhere.
 */
function world(opts: WorldOptions = {}) {
  let t = 10_000;
  const calls: Call[] = [];
  const unexpected: string[] = [];
  const envTable: Record<string, string | undefined> = opts.env ?? {
    SUPABASE_URL,
    SUPABASE_ANON_KEY: ANON,
    GEMINI_API_KEY: GEMINI_KEY,
    GEMINI_API_BASE: GEMINI_BASE,
  };
  const geminiKey = opts.geminiKey ?? GEMINI;
  const routes: Record<string, Route> = {
    [OWNER]: opts.owner ?? (() => json(true)),
    [KINDS]: opts.kinds ?? (() => json(KIND_NAMES.map((name) => ({ name })))),
    [geminiKey]: async (call) => {
      t += 1234.6;
      return await (opts.gemini ??
        (() => geminiEnvelope(JSON.stringify(GOOD_REPLY))))(call);
    },
    [JOBS]: opts.jobs ??
      ((call) => json([{ ...JSON.parse(call.body), id: JOB_ID }], 201)),
  };
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const key = `${req.method} ${url.origin}${url.pathname}`;
    const call: Call = {
      key,
      url,
      headers: req.headers,
      body: await req.text(),
    };
    calls.push(call);
    const route = routes[key];
    if (route === undefined) {
      unexpected.push(`${req.method} ${req.url}`);
      throw new Error(`unexpected fetch ${req.method} ${req.url}`);
    }
    return await route(call);
  }) as typeof globalThis.fetch;
  return {
    deps: { fetch, env: (n: string) => envTable[n], now: () => t },
    calls,
    keys: () => calls.map((c) => c.key),
    unexpected,
    call: (key: string) => {
      const found = calls.filter((c) => c.key === key);
      assertEquals(found.length, 1, `expected exactly one ${key}`);
      return found[0]!;
    },
  };
}

function post(
  body: unknown,
  authorization: string | null = OWNER_JWT,
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization !== null) headers.set("authorization", authorization);
  return new Request(`${SUPABASE_URL}/functions/v1/capture`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function run(w: ReturnType<typeof world>, req: Request) {
  const res = await handleCapture(req, w.deps);
  assert(
    (res.headers.get("content-type") ?? "").startsWith("application/json"),
    `response ${res.status} has content-type ${res.headers.get("content-type")}`,
  );
  // CAL-047 AC-2: every reply the handler produces is readable cross-origin.
  assertEquals(
    res.headers.get("access-control-allow-origin"),
    "*",
    `response ${res.status} has no Access-Control-Allow-Origin: *, so the browser cannot read it`,
  );
  const body = await res.json();
  assertEquals(w.unexpected, [], "the handler fetched a URL nobody expected");
  return { status: res.status, body };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jobBody(w: ReturnType<typeof world>): Record<string, unknown> {
  return JSON.parse(w.call(JOBS).body);
}

// ---------------------------------------------------------------- step 1

Deno.test("a GET is 405 and fetches nothing", async () => {
  const w = world();
  const res = await handleCapture(
    new Request(`${SUPABASE_URL}/functions/v1/capture`, {
      method: "GET",
      headers: { authorization: OWNER_JWT },
    }),
    w.deps,
  );
  assertEquals(res.status, 405);
  assert(
    (res.headers.get("content-type") ?? "").startsWith("application/json"),
  );
  // CAL-047 AC-2: this test bypasses run(), so it asserts the header itself.
  assertEquals(
    res.headers.get("access-control-allow-origin"),
    "*",
    "response 405 has no Access-Control-Allow-Origin: *, so the browser cannot read it",
  );
  assertEquals(w.keys(), []);
});

// ---------------------------------------------------------------- CAL-047 AC-1

/** The CAL-047 Contract Block 1 ALLOWED_HEADERS, read out of the contract. */
const CORS_ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-retry-count",
  "traceparent",
  "tracestate",
  "baggage",
];

Deno.test("CAL-047 AC-1: the browser's CORS preflight is 204 with allow-origin *, every allowed header and POST, and fetches nothing", async () => {
  const w = world();
  const res = await handleCapture(
    new Request(`${SUPABASE_URL}/functions/v1/capture`, {
      method: "OPTIONS",
      headers: {
        origin: "https://clean-calendar.pages.dev",
        "access-control-request-method": "POST",
        "access-control-request-headers":
          "authorization,apikey,content-type,x-client-info",
      },
    }),
    w.deps,
  );
  assertEquals(
    res.status,
    204,
    `the preflight was refused with ${res.status}; the browser will never send the POST`,
  );
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
  const allowHeaders = (res.headers.get("access-control-allow-headers") ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h !== "");
  const notAllowed = CORS_ALLOWED_HEADERS.filter(
    (h) => !allowHeaders.includes(h),
  );
  assertEquals(
    notAllowed,
    [],
    `the preflight does not allow ${notAllowed.join(", ")}`,
  );
  const allowMethods = (res.headers.get("access-control-allow-methods") ?? "")
    .split(",")
    .map((m) => m.trim().toUpperCase());
  assert(
    allowMethods.includes("POST"),
    `the preflight's allow-methods is ${
      res.headers.get("access-control-allow-methods")
    }, which does not name POST`,
  );
  assertEquals(w.keys(), [], "the preflight fetched something");
  assertEquals(w.unexpected, []);
});

// ---------------------------------------------------------------- AC-4, 401

Deno.test("AC-4: no Authorization header is 401 unauthorized; Gemini is never called and no job row is written", async () => {
  const w = world();
  const { status, body } = await run(w, post({ text: TEXT }, null));
  assertEquals(status, 401);
  assertEquals(body, { error: "unauthorized" });
  assertEquals(w.keys(), []);
});

Deno.test("AC-4: a Basic Authorization header is 401, not a bearer token", async () => {
  const w = world();
  const { status, body } = await run(
    w,
    post({ text: TEXT }, "Basic dXNlcjpwYXNz"),
  );
  assertEquals(status, 401);
  assertEquals(body, { error: "unauthorized" });
  assertEquals(w.keys(), []);
});

Deno.test("AC-4: the bearer check comes before the body check: no token and an empty text is 401, not 400", async () => {
  const w = world();
  const { status } = await run(w, post({ text: "" }, null));
  assertEquals(status, 401);
  assertEquals(w.keys(), []);
});

// ---------------------------------------------------------------- AC-6, 400

for (
  const [name, body] of [
    ["an empty text", { text: "" }],
    ["a whitespace-only text", { text: "   " }],
    ["a text of 20,001 characters", { text: "a".repeat(20_001) }],
    [
      "a text of 20,001 UTF-16 units (10,000 emoji and one letter, 10,001 code points)",
      { text: "\u{1F642}".repeat(10_000) + "a" },
    ],
    ["a body that is not JSON", "text=hello"],
    ["a text that is a number", { text: 5 }],
    ["a body with no text", { note: TEXT }],
  ] as const
) {
  Deno.test(`AC-6: ${name} is 400 bad_request; nothing is fetched, so Gemini is not called and no job row is written`, async () => {
    const w = world();
    const res = await run(w, post(body));
    assertEquals(res.status, 400);
    assertEquals(res.body, { error: "bad_request" });
    assertEquals(w.keys(), []);
  });
}

Deno.test("AC-6: the limit is 20,000, exported as MAX_TEXT_CHARS", () => {
  assertEquals(MAX_TEXT_CHARS, 20_000);
});

Deno.test("AC-6: a text of exactly 20,000 characters is accepted and reaches Gemini", async () => {
  const w = world();
  const { status } = await run(w, post({ text: "a".repeat(20_000) }));
  assertEquals(status, 200);
  assertEquals(w.keys(), [OWNER, KINDS, GEMINI, JOBS]);
});

Deno.test("AC-6: 10,000 emoji are 20,000 UTF-16 units and are accepted (String.length, the client's measure)", async () => {
  const w = world();
  const { status } = await run(w, post({ text: "\u{1F642}".repeat(10_000) }));
  assertEquals(status, 200);
});

// ---------------------------------------------------------------- AC-4, 403

Deno.test("AC-4: a valid JWT for someone other than the owner is 403 forbidden; Gemini is never called and no job row is written", async () => {
  const w = world({ owner: () => json(false) });
  const { status, body } = await run(w, post({ text: TEXT }, "Bearer x-jwt"));
  assertEquals(status, 403);
  assertEquals(body, { error: "forbidden" });
  assertEquals(w.keys(), [OWNER]);
});

Deno.test("AC-4: an owner check that errors (500) is 403, and Gemini is never called", async () => {
  const w = world({ owner: () => json({ message: "boom" }, 500) });
  const { status, body } = await run(w, post({ text: TEXT }));
  assertEquals(status, 403);
  assertEquals(body, { error: "forbidden" });
  assertEquals(w.keys(), [OWNER]);
});

Deno.test("the body check comes before the owner check: a bad body from a stranger is 400 and nothing is fetched", async () => {
  const w = world({ owner: () => json(false) });
  const { status } = await run(w, post({ text: "" }, "Bearer x-jwt"));
  assertEquals(status, 400);
  assertEquals(w.keys(), []);
});

// ---------------------------------------------------------------- step 5

Deno.test("live kinds are read with the anon key and the caller's JWT, not deleted, in sort order", async () => {
  const w = world();
  await run(w, post({ text: TEXT }));
  const call = w.call(KINDS);
  assertEquals(call.url.searchParams.get("select"), "name");
  assertEquals(call.url.searchParams.get("deleted_at"), "is.null");
  assertEquals(call.url.searchParams.get("order"), "sort_order.asc");
  assertEquals(call.headers.get("apikey"), ANON);
  assertEquals(call.headers.get("authorization"), OWNER_JWT);
});

Deno.test("a kinds read that fails is 502 upstream, before Gemini and without a job row", async () => {
  const w = world({ kinds: () => json({ message: "down" }, 503) });
  const { status, body } = await run(w, post({ text: TEXT }));
  assertEquals(status, 502);
  assertEquals(body, { error: "upstream" });
  assertEquals(w.keys(), [OWNER, KINDS]);
});

// ---------------------------------------------------------------- AC-1

Deno.test("AC-1: the owner's capture returns 200 with the proposal, confidence, missing and the job row's id", async () => {
  const w = world();
  const { status, body } = await run(w, post({ text: TEXT }));
  assertEquals(status, 200);
  assertEquals(body, { ...GOOD_REPLY, jobId: JOB_ID });
  assertEquals(w.keys(), [OWNER, KINDS, GEMINI, JOBS]);
});

Deno.test("AC-1: Gemini is called once, at {GEMINI_API_BASE}/v1beta/models/gemini-2.5-flash:generateContent, with the key in x-goog-api-key and not in the URL", async () => {
  const w = world();
  await run(w, post({ text: TEXT }));
  const call = w.call(GEMINI);
  assertEquals(call.headers.get("x-goog-api-key"), GEMINI_KEY);
  assertEquals(call.url.search, "", "the Gemini URL carries a query string");
  assert(!call.url.href.includes(GEMINI_KEY), "the key is in the Gemini URL");
});

Deno.test("AC-1: the Gemini request asks for application/json against a responseSchema", async () => {
  const w = world();
  await run(w, post({ text: TEXT }));
  const req = JSON.parse(w.call(GEMINI).body);
  assertEquals(req.generationConfig.responseMimeType, "application/json");
  assertEquals(typeof req.generationConfig.responseSchema, "object");
  assert(req.generationConfig.responseSchema !== null);
  assert(!Array.isArray(req.generationConfig.responseSchema));
});

Deno.test("AC-1: the prompt contains the shared text and every live kind name", async () => {
  const w = world({
    kinds: () =>
      json([{ name: "Physio & Rehab" }, { name: "Kids' clubs" }, {
        name: "Work",
      }]),
  });
  await run(w, post({ text: TEXT }));
  const req = JSON.parse(w.call(GEMINI).body);
  const prompt = req.contents[0].parts[0].text as string;
  assert(prompt.includes(TEXT), "the prompt does not contain the text");
  for (const name of ["Physio & Rehab", "Kids' clubs", "Work"]) {
    assert(prompt.includes(name), `the prompt does not name the kind ${name}`);
  }
});

Deno.test("AC-1: without GEMINI_API_BASE the call goes to https://generativelanguage.googleapis.com", async () => {
  const w = world({
    env: { SUPABASE_URL, SUPABASE_ANON_KEY: ANON, GEMINI_API_KEY: GEMINI_KEY },
    geminiKey:
      "POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  });
  const { status } = await run(w, post({ text: TEXT }));
  assertEquals(status, 200);
  assertEquals(w.calls.length, 4);
});

Deno.test("AC-1: the Gemini key appears in no response and in no job row", async () => {
  const w = world();
  const { body } = await run(w, post({ text: TEXT }));
  assert(!JSON.stringify(body).includes(GEMINI_KEY));
  assert(!w.call(JOBS).body.includes(GEMINI_KEY));
  for (const c of w.calls.filter((c) => c.key !== GEMINI)) {
    assertEquals(c.headers.get("x-goog-api-key"), null, `${c.key} got the key`);
  }
});

// ---------------------------------------------------------------- AC-5

Deno.test("AC-5: a successful capture's job row is input_kind text, the SHA-256 hex of the text, the model, proposed, and latency_ms", async () => {
  const w = world();
  await run(w, post({ text: TEXT }));
  assertEquals(jobBody(w), {
    input_kind: "text",
    input_hash: await sha256Hex(TEXT),
    model: "gemini-2.5-flash",
    proposal: GOOD_REPLY.proposal,
    confidence: GOOD_REPLY.confidence,
    status: "proposed",
    error: null,
    latency_ms: 1235,
  });
});

Deno.test('AC-5: the hash of "abc" is the published SHA-256 vector ba7816bf...15ad', async () => {
  const w = world();
  await run(w, post({ text: "abc" }));
  assertEquals(
    jobBody(w).input_hash,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

Deno.test("AC-5: the hash is over the UTF-8 bytes of the text (Café at 10:00)", async () => {
  const w = world();
  await run(w, post({ text: "Café at 10:00" }));
  // sha256sum of the UTF-8 bytes. UTF-16LE would give 6ecd3bc5..., and
  // dropping the accent 3514093c...
  assertEquals(
    jobBody(w).input_hash,
    "1fb8e92d1e4f708105860d69dda58fde848e4feac16884d3c68e7e895270f8b4",
  );
});

Deno.test("AC-5: the text itself appears in no field of the job row", async () => {
  const w = world();
  await run(w, post({ text: TEXT }));
  const raw = w.call(JOBS).body;
  assert(!raw.includes(TEXT), "the job row carries the input text");
  assert(!raw.includes("QX-77812"), "the job row carries part of the text");
});

Deno.test("AC-5: the job row is posted with the anon key, the caller's JWT and Prefer: return=representation", async () => {
  const w = world();
  await run(w, post({ text: TEXT }));
  const call = w.call(JOBS);
  assertEquals(call.headers.get("apikey"), ANON);
  assertEquals(call.headers.get("authorization"), OWNER_JWT);
  assert(
    (call.headers.get("prefer") ?? "").includes("return=representation"),
    `Prefer was ${call.headers.get("prefer")}`,
  );
});

Deno.test("a job row insert that fails is 502 upstream", async () => {
  const w = world({ jobs: () => json({ message: "denied" }, 403) });
  const { status, body } = await run(w, post({ text: TEXT }));
  assertEquals(status, 502);
  assertEquals(body, { error: "upstream" });
  assertEquals(w.keys(), [OWNER, KINDS, GEMINI, JOBS]);
});

Deno.test("a job row insert that succeeds but returns no id is 502 upstream", async () => {
  const w = world({ jobs: () => json([{}], 201) });
  const { status, body } = await run(w, post({ text: TEXT }));
  assertEquals(status, 502);
  assertEquals(body, { error: "upstream" });
  assertEquals(w.keys(), [OWNER, KINDS, GEMINI, JOBS]);
});

// ---------------------------------------------------------------- AC-2

async function captureWith(
  proposal: Record<string, unknown>,
  missing: string[],
  kinds: string[] = KIND_NAMES,
) {
  const reply = {
    ...GOOD_REPLY,
    proposal: { ...GOOD_REPLY.proposal, ...proposal },
    missing,
  };
  const w = world({
    kinds: () => json(kinds.map((name) => ({ name }))),
    gemini: () => geminiEnvelope(JSON.stringify(reply)),
  });
  const res = await run(w, post({ text: TEXT }));
  assertEquals(res.status, 200);
  return { body: res.body, row: jobBody(w) };
}

Deno.test("AC-2: a kindName that is not one of the owner's live kinds becomes null and kind is added to missing", async () => {
  const { body, row } = await captureWith({ kindName: "Gym" }, ["endsAt"]);
  assertEquals(body.proposal.kindName, null);
  assertEquals(body.missing, ["endsAt", "kind"]);
  assertEquals((row.proposal as { kindName: unknown }).kindName, null);
});

Deno.test("AC-2: when the model already listed kind as missing, it is not listed twice", async () => {
  const { body } = await captureWith({ kindName: "Gym" }, ["kind", "endsAt"]);
  assertEquals(body.proposal.kindName, null);
  assertEquals(body.missing, ["kind", "endsAt"]);
});

Deno.test("AC-2: an owner with no live kinds gets kindName null and kind missing whatever the model said", async () => {
  const { body } = await captureWith({ kindName: "Doctor" }, [], []);
  assertEquals(body.proposal.kindName, null);
  assertEquals(body.missing, ["kind"]);
});

Deno.test("AC-2: a kind matched ignoring case and surrounding spaces is replaced by its stored spelling", async () => {
  const { body, row } = await captureWith({ kindName: "  dOCTOR " }, []);
  assertEquals(body.proposal.kindName, "Doctor");
  assertEquals(body.missing, []);
  assertEquals((row.proposal as { kindName: unknown }).kindName, "Doctor");
});

Deno.test("AC-2: a kindName the model left null stays null and does not add kind to missing", async () => {
  const { body } = await captureWith({ kindName: null }, []);
  assertEquals(body.proposal.kindName, null);
  assertEquals(body.missing, []);
});

Deno.test("AC-2: missing keeps the model's order and loses duplicates", async () => {
  const { body } = await captureWith({ kindName: "Gym" }, [
    "location",
    "title",
    "location",
  ]);
  assertEquals(body.missing, ["location", "title", "kind"]);
});

// ---------------------------------------------------------------- AC-3

async function unreadable(replyText: string) {
  const w = world({ gemini: () => geminiEnvelope(replyText) });
  const res = await run(w, post({ text: TEXT }));
  assertEquals(res.status, 502);
  assertEquals(res.body, { error: "unreadable" });
  assertEquals(w.keys(), [OWNER, KINDS, GEMINI, JOBS]);
  const row = jobBody(w);
  assertEquals(row.input_kind, "text");
  assertEquals(row.input_hash, await sha256Hex(TEXT));
  assertEquals(row.model, "gemini-2.5-flash");
  assertEquals(row.status, "discarded");
  assertEquals(row.proposal, null);
  assertEquals(row.confidence, null);
  assertEquals(row.latency_ms, 1235);
  assert(!w.call(JOBS).body.includes(TEXT), "the job row carries the text");
  assertEquals(typeof row.error, "string");
  return row.error as string;
}

Deno.test("AC-3: a reply that is not JSON is 502 unreadable and the job row records 'unreadable: not json'", async () => {
  assertEquals(
    await unreadable('{"proposal": {"title": "Dentist"'),
    "unreadable: not json",
  );
});

Deno.test("AC-3: a reply missing proposal.location is 502 unreadable and the row's error names the path", async () => {
  const { location: _dropped, ...proposal } = GOOD_REPLY.proposal;
  const error = await unreadable(JSON.stringify({ ...GOOD_REPLY, proposal }));
  assertMatch(error, /^unreadable: /);
  assert(error !== "unreadable: not json");
  assert(error.includes("location"), `error ${error} does not name location`);
});

Deno.test("AC-3: a confidence of 1.5 is 502 unreadable and the row's error names confidence", async () => {
  const error = await unreadable(
    JSON.stringify({ ...GOOD_REPLY, confidence: { title: 1.5 } }),
  );
  assertMatch(error, /^unreadable: /);
  assert(error.includes("confidence"), `error ${error} does not name it`);
});

Deno.test("AC-3: a confidence of -0.1 is 502 unreadable", async () => {
  const error = await unreadable(
    JSON.stringify({ ...GOOD_REPLY, confidence: { kind: -0.1 } }),
  );
  assertMatch(error, /^unreadable: /);
});

Deno.test("AC-3: a proposal with an extra key is 502 unreadable", async () => {
  const error = await unreadable(
    JSON.stringify({
      ...GOOD_REPLY,
      proposal: { ...GOOD_REPLY.proposal, notes: "x" },
    }),
  );
  assertMatch(error, /^unreadable: /);
});

Deno.test("AC-3: a reply with no candidate at all is 502 unreadable", async () => {
  const w = world({ gemini: () => json({ candidates: [] }) });
  const res = await run(w, post({ text: TEXT }));
  assertEquals(res.status, 502);
  assertEquals(res.body, { error: "unreadable" });
  const row = jobBody(w);
  assertEquals(row.status, "discarded");
  assertMatch(String(row.error), /^unreadable: /);
});

// ---------------------------------------------------------------- step 6

Deno.test("a Gemini 500 is 502 upstream, with a discarded job row recording 'upstream 500'", async () => {
  const w = world({ gemini: () => json({ error: { code: 500 } }, 500) });
  const { status, body } = await run(w, post({ text: TEXT }));
  assertEquals(status, 502);
  assertEquals(body, { error: "upstream" });
  assertEquals(w.keys(), [OWNER, KINDS, GEMINI, JOBS]);
  const row = jobBody(w);
  assertEquals(row.status, "discarded");
  assertEquals(row.error, "upstream 500");
  assertEquals(row.confidence, null);
  assertEquals(row.proposal, null);
  assertEquals(row.input_hash, await sha256Hex(TEXT));
  assertEquals(row.latency_ms, 1235);
  assert(!w.call(JOBS).body.includes(TEXT));
});

Deno.test("a Gemini 429 records 'upstream 429'", async () => {
  const w = world({ gemini: () => json({ error: { code: 429 } }, 429) });
  const { status } = await run(w, post({ text: TEXT }));
  assertEquals(status, 502);
  assertEquals(jobBody(w).error, "upstream 429");
});

Deno.test("a Gemini network failure is 502 upstream, with a discarded job row recording 'upstream fetch'", async () => {
  const w = world({
    gemini: () => {
      throw new TypeError("connection refused");
    },
  });
  const { status, body } = await run(w, post({ text: TEXT }));
  assertEquals(status, 502);
  assertEquals(body, { error: "upstream" });
  assertEquals(w.keys(), [OWNER, KINDS, GEMINI, JOBS]);
  const row = jobBody(w);
  assertEquals(row.status, "discarded");
  assertEquals(row.error, "upstream fetch");
  assertEquals(row.confidence, null);
  assertEquals(row.proposal, null);
  assertEquals(row.latency_ms, 1235);
});

// ================================================================ CAL-019
//
// CAL-019 Contract Blocks 1, 2 and 4: the image path. Settled values are read
// out of the Contract, never calibrated: the three MIME strings, 4,194,304
// decoded bytes accepted / 4,194,305 refused, 400/413/415 and their error
// strings, the part order and snake_case field names, and the SHA-256 vectors
// (computed with `sha256sum` over the raw bytes, independent of crypto.subtle).
//
// The new exports are read through a namespace import, not named imports: Deno
// type-checks the whole test graph before running anything, so one missing
// named export would take every CAL-018 test dark with it. Read this way, the
// absence is a runtime assertion failure in exactly the test that needs it.

import * as handlerModule from "./handler.ts";

const PNG = "image/png";
/** base64 of the three bytes "abc"; the Contract's settled vector. */
const ABC_B64 = "YWJj";
const ABC_BYTES_SHA256 =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
/** sha256 of the STRING "YWJj" - what a hash over the base64 would give. */
const ABC_STRING_SHA256 =
  "35d95694d3f160215db293c7899daa5907837838fb4b8119ed713e32446c1266";
/** base64 of the bytes ff fe 00 80: '/' in the alphabet, '==' padding, non-UTF-8 bytes. */
const BINARY_B64 = "//4AgA==";
/**
 * sha256sum of the raw bytes ff fe 00 80. Re-encoding atob()'s binary string
 * as UTF-8 before hashing gives f033f57b...; the hash of the base64 string is
 * different again.
 */
const BINARY_BYTES_SHA256 =
  "5a741968f40e57485ed6e1a1af381adeb2714223c35acedf1ad0670e42df2eb5";
/** base64 of "Booking ref QX-77812 screenshot" - distinctive decoded bytes. */
const SCREENSHOT_B64 = "Qm9va2luZyByZWYgUVgtNzc4MTIgc2NyZWVuc2hvdA==";

/** Standard, padded base64 of `bytes`, built in chunks (btoa per 24,576 bytes). */
function base64Of(bytes: Uint8Array): string {
  const CHUNK = 3 * 8192; // a multiple of 3, so only the last chunk pads
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += btoa(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return out;
}

/** A fake "image" of exactly `n` decoded bytes (the MIME type is not sniffed). */
function imageOfBytes(n: number): string {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = (i * 31 + 7) & 0xff;
  return base64Of(bytes);
}

const MAX_IMAGE_BYTES_SETTLED = 4 * 1024 * 1024; // 4,194,304
// Built once per file, not per test.
const AT_LIMIT_B64 = imageOfBytes(MAX_IMAGE_BYTES_SETTLED);
const OVER_LIMIT_B64 = imageOfBytes(MAX_IMAGE_BYTES_SETTLED + 1);

type GeminiBody = {
  contents: { role: string; parts: Record<string, unknown>[] }[];
  generationConfig: Record<string, unknown>;
};

function geminiBody(w: ReturnType<typeof world>): GeminiBody {
  return JSON.parse(w.call(GEMINI).body);
}

/** The prompt text part of an image request, after checking the part shape. */
function imagePromptPart(req: GeminiBody): string {
  assertEquals(req.contents.length, 1, "one user turn");
  const parts = req.contents[0]!.parts;
  assertEquals(
    parts.length,
    2,
    `expected [image, prompt], got ${parts.length} parts`,
  );
  assertEquals(
    Object.keys(parts[1]!),
    ["text"],
    "the second part is the prompt text part",
  );
  assertEquals(typeof parts[1]!.text, "string");
  return parts[1]!.text as string;
}

// ---------------------------------------------------------------- exports

Deno.test("CAL-019 AC-2: the image limit is 4 * 1024 * 1024 decoded bytes, exported as MAX_IMAGE_BYTES", () => {
  assertEquals(
    (handlerModule as Record<string, unknown>).MAX_IMAGE_BYTES,
    4_194_304,
  );
});

Deno.test("CAL-019 AC-2: the accepted MIME types are exactly image/png, image/jpeg, image/webp, exported as IMAGE_MIME_TYPES", () => {
  const types = (handlerModule as Record<string, unknown>).IMAGE_MIME_TYPES;
  assert(Array.isArray(types), `IMAGE_MIME_TYPES is ${String(types)}`);
  assertEquals([...types], ["image/png", "image/jpeg", "image/webp"]);
});

// ---------------------------------------------------------------- AC-1

for (const mime of ["image/png", "image/jpeg", "image/webp"]) {
  Deno.test(`CAL-019 AC-1: an owner's ${mime} capture returns 200 with the proposal and the job id, after owner, kinds, Gemini, row`, async () => {
    const w = world();
    const { status, body } = await run(w, post({ image: ABC_B64, mime }));
    assertEquals(status, 200);
    assertEquals(body, { ...GOOD_REPLY, jobId: JOB_ID });
    assertEquals(w.keys(), [OWNER, KINDS, GEMINI, JOBS]);
  });

  Deno.test(`CAL-019 AC-1: a ${mime} capture sends Gemini [inline_data {mime_type ${mime}, the base64 as received}, the prompt text]`, async () => {
    const w = world();
    await run(w, post({ image: BINARY_B64, mime }));
    const req = geminiBody(w);
    assertEquals(req.contents[0]!.role, "user");
    assertEquals(
      req.contents[0]!.parts[0],
      { inline_data: { mime_type: mime, data: BINARY_B64 } },
      "the first part is the image, byte for byte",
    );
    imagePromptPart(req);
  });
}

Deno.test("CAL-019 AC-1: the image request asks for application/json against the same responseSchema at temperature 0 as a text request", async () => {
  const wi = world();
  await run(wi, post({ image: ABC_B64, mime: PNG }));
  const wt = world();
  await run(wt, post({ text: TEXT }));
  assertEquals(
    geminiBody(wi).generationConfig,
    geminiBody(wt).generationConfig,
  );
  assertEquals(
    geminiBody(wi).generationConfig.responseMimeType,
    "application/json",
  );
});

Deno.test("CAL-019 AC-1: the image request's prompt part names every live kind and carries no <<< text delimiter", async () => {
  const kinds = ["Physio & Rehab", "Kids' clubs", "Work"];
  const w = world({ kinds: () => json(kinds.map((name) => ({ name }))) });
  await run(w, post({ image: ABC_B64, mime: PNG }));
  const prompt = imagePromptPart(geminiBody(w));
  for (const name of kinds) {
    assert(prompt.includes(name), `the prompt does not name the kind ${name}`);
  }
  assert(
    !prompt.includes("<<<"),
    "the image prompt carries the text prompt's <<< delimiter",
  );
});

Deno.test("CAL-019 AC-1: the Gemini key travels in x-goog-api-key on an image capture, not in the URL", async () => {
  const w = world();
  await run(w, post({ image: ABC_B64, mime: PNG }));
  const call = w.call(GEMINI);
  assertEquals(call.headers.get("x-goog-api-key"), GEMINI_KEY);
  assertEquals(call.url.search, "");
});

Deno.test("CAL-019 AC-2: an image of exactly 4,194,304 decoded bytes is accepted and the whole base64 reaches Gemini unchanged", async () => {
  const w = world();
  const { status } = await run(w, post({ image: AT_LIMIT_B64, mime: PNG }));
  assertEquals(status, 200);
  assertEquals(w.keys(), [OWNER, KINDS, GEMINI, JOBS]);
  const part = geminiBody(w).contents[0]!.parts[0] as {
    inline_data?: { mime_type?: unknown; data?: unknown };
  };
  assertEquals(part.inline_data?.mime_type, PNG);
  assert(
    part.inline_data?.data === AT_LIMIT_B64,
    "the inline_data payload is not the received base64, byte for byte",
  );
});

Deno.test("CAL-019 AC-1: the reply is handled as for text: a kind matched ignoring case takes its stored spelling", async () => {
  const reply = {
    ...GOOD_REPLY,
    proposal: { ...GOOD_REPLY.proposal, kindName: "  dOCTOR " },
    missing: [],
  };
  const w = world({ gemini: () => geminiEnvelope(JSON.stringify(reply)) });
  const { status, body } = await run(w, post({ image: ABC_B64, mime: PNG }));
  assertEquals(status, 200);
  assertEquals(body.proposal.kindName, "Doctor");
});

Deno.test("CAL-019 AC-1: the reply is handled as for text: an unknown kind becomes null and kind is added to missing", async () => {
  const reply = {
    ...GOOD_REPLY,
    proposal: { ...GOOD_REPLY.proposal, kindName: "Gym" },
  };
  const w = world({ gemini: () => geminiEnvelope(JSON.stringify(reply)) });
  const { status, body } = await run(w, post({ image: ABC_B64, mime: PNG }));
  assertEquals(status, 200);
  assertEquals(body.proposal.kindName, null);
  assertEquals(body.missing, ["endsAt", "kind"]);
});

Deno.test("CAL-019 AC-1: an unreadable reply to an image is 502 unreadable with a discarded image row", async () => {
  const w = world({ gemini: () => geminiEnvelope("not json at all") });
  const { status, body } = await run(w, post({ image: ABC_B64, mime: PNG }));
  assertEquals(status, 502);
  assertEquals(body, { error: "unreadable" });
  assertEquals(w.keys(), [OWNER, KINDS, GEMINI, JOBS]);
  const row = jobBody(w);
  assertEquals(row.input_kind, "image");
  assertEquals(row.input_hash, ABC_BYTES_SHA256);
  assertEquals(row.status, "discarded");
  assertEquals(row.error, "unreadable: not json");
  assertEquals(row.proposal, null);
  assertEquals(row.latency_ms, 1235);
});

Deno.test("CAL-019 AC-1: a Gemini 500 on an image is 502 upstream with an image row recording 'upstream 500'", async () => {
  const w = world({ gemini: () => json({ error: { code: 500 } }, 500) });
  const { status, body } = await run(w, post({ image: ABC_B64, mime: PNG }));
  assertEquals(status, 502);
  assertEquals(body, { error: "upstream" });
  const row = jobBody(w);
  assertEquals(row.input_kind, "image");
  assertEquals(row.error, "upstream 500");
  assertEquals(row.status, "discarded");
});

// ---------------------------------------------------------------- AC-4

Deno.test("CAL-019 AC-4: an image capture's job row is input_kind image, the SHA-256 of the decoded bytes (abc -> ba7816bf...), the model, proposed, latency_ms", async () => {
  const w = world();
  await run(w, post({ image: ABC_B64, mime: PNG }));
  assertEquals(jobBody(w), {
    input_kind: "image",
    input_hash: ABC_BYTES_SHA256,
    model: "gemini-2.5-flash",
    proposal: GOOD_REPLY.proposal,
    confidence: GOOD_REPLY.confidence,
    status: "proposed",
    error: null,
    latency_ms: 1235,
  });
});

Deno.test('CAL-019 AC-4: the image hash is NOT the SHA-256 of the base64 string "YWJj" (35d95694...)', async () => {
  const w = world();
  await run(w, post({ image: ABC_B64, mime: PNG }));
  const hash = jobBody(w).input_hash;
  assert(
    hash !== ABC_STRING_SHA256,
    "input_hash is the SHA-256 of the base64 string, not of the decoded bytes",
  );
  assertEquals(hash, ABC_BYTES_SHA256);
});

Deno.test("CAL-019 AC-4: the hash is over the raw decoded bytes ff fe 00 80, not a UTF-8 re-encoding of them", async () => {
  const w = world();
  await run(w, post({ image: BINARY_B64, mime: "image/webp" }));
  assertEquals(jobBody(w).input_hash, BINARY_BYTES_SHA256);
});

Deno.test("CAL-019 AC-4: neither the base64 nor the decoded bytes appear in any field of the job row", async () => {
  const w = world();
  await run(w, post({ image: SCREENSHOT_B64, mime: PNG }));
  const raw = w.call(JOBS).body;
  assert(!raw.includes(SCREENSHOT_B64), "the job row carries the base64");
  assert(!raw.includes("QX-77812"), "the job row carries the decoded bytes");
  assert(!raw.includes("screenshot"), "the job row carries the decoded bytes");
  assertEquals(Object.keys(JSON.parse(raw)).sort(), [
    "confidence",
    "error",
    "input_hash",
    "input_kind",
    "latency_ms",
    "model",
    "proposal",
    "status",
  ]);
});

// ---------------------------------------------------------------- AC-2, 413

Deno.test("CAL-019 AC-2: an image of 4,194,305 decoded bytes is 413 payload_too_large and nothing is fetched", async () => {
  // Same base64 length as the accepted 4,194,304-byte image (5,592,408
  // chars): only the decoded length tells them apart.
  assertEquals(OVER_LIMIT_B64.length, AT_LIMIT_B64.length);
  const w = world();
  const { status, body } = await run(
    w,
    post({ image: OVER_LIMIT_B64, mime: PNG }),
  );
  assertEquals(status, 413);
  assertEquals(body, { error: "payload_too_large" });
  assertEquals(w.keys(), []);
});

Deno.test("CAL-019 AC-2: an oversized image from a non-owner is 413, before the owner check", async () => {
  const w = world({ owner: () => json(false) });
  const { status } = await run(
    w,
    post({ image: OVER_LIMIT_B64, mime: PNG }, "Bearer x-jwt"),
  );
  assertEquals(status, 413);
  assertEquals(w.keys(), []);
});

// ---------------------------------------------------------------- AC-2, 415

for (
  const [name, mime] of [
    ["image/gif", "image/gif"],
    ["application/pdf", "application/pdf"],
    ["an upper-case IMAGE/PNG", "IMAGE/PNG"],
    ["image/png with a parameter", "image/png; charset=binary"],
    ["image/png with a leading space", " image/png"],
    ["image/jpg (not image/jpeg)", "image/jpg"],
    ["an empty mime", ""],
    ["a mime that is a number", 5],
    ["a null mime", null],
  ] as const
) {
  Deno.test(`CAL-019 AC-2: ${name} is 415 unsupported_media_type and nothing is fetched`, async () => {
    const w = world();
    const res = await run(w, post({ image: ABC_B64, mime }));
    assertEquals(res.status, 415);
    assertEquals(res.body, { error: "unsupported_media_type" });
    assertEquals(w.keys(), []);
  });
}

Deno.test("CAL-019 AC-2: an image with no mime at all is 415 and nothing is fetched", async () => {
  const w = world();
  const res = await run(w, post({ image: ABC_B64 }));
  assertEquals(res.status, 415);
  assertEquals(res.body, { error: "unsupported_media_type" });
  assertEquals(w.keys(), []);
});

// ---------------------------------------------------------------- AC-5, 400

// Each rejected string is paired with the nearest string that IS strict
// standard base64 and must be accepted. The pair is the control: it proves the
// 400 comes from the one character or rule that differs, not from a handler
// that refuses every image (which is exactly what the pre-CAL-019 handler does).
for (
  const [name, image, control] of [
    ["an empty string", "", "YWJj"],
    ["CRLF line breaks inside (MIME-style)", "YWJj\r\nYWJj\r\n", "YWJjYWJj"],
    ["spaces inside", "YWJj    YWJj", "YWJjYWJj"],
    ["a URL-safe '-'", "YW-j", "YW+j"],
    ["a URL-safe '_'", "YW_j", "YW/j"],
    ["URL-safe '-_' where standard is '+/'", "-_8A", "+/8A"],
    ["a length of 5", "YWJjY", "YWJj"],
    ["an unpadded final group (length 3)", "YWI", "YWI="],
    ["a '!'", "YWJ!", "YWJj"],
    ["a non-ASCII letter", "YWJ\u00e9", "YWJj"],
    ["'=' in the middle of a group", "YW=jYWJj", "YWJjYWJj"],
    ["a padded group followed by more data", "YQ==YWJj", "YWJjYQ=="],
    ["three '=' of padding", "Y===", "YQ=="],
    ["nothing but padding", "====", "YWJj"],
  ] as const
) {
  Deno.test(`CAL-019 AC-5: base64 with ${name} is 400 bad_request and nothing is fetched (while ${JSON.stringify(control)} is accepted)`, async () => {
    const w = world();
    const res = await run(w, post({ image, mime: PNG }));
    assertEquals(res.status, 400);
    assertEquals(res.body, { error: "bad_request" });
    assertEquals(w.keys(), []);
    const ok = await run(world(), post({ image: control, mime: PNG }));
    assertEquals(
      ok.status,
      200,
      `the control ${JSON.stringify(control)} was refused`,
    );
  });
}

for (
  const [name, image] of [
    ["a number", 5],
    ["null", null],
    ["an array", [ABC_B64]],
    ["an object", { data: ABC_B64 }],
  ] as const
) {
  Deno.test(`CAL-019 AC-5: an image that is ${name}, not a string, is 400 bad_request and nothing is fetched (while the string is accepted)`, async () => {
    const w = world();
    const res = await run(w, post({ image, mime: PNG }));
    assertEquals(res.status, 400);
    assertEquals(res.body, { error: "bad_request" });
    assertEquals(w.keys(), []);
    const ok = await run(world(), post({ image: ABC_B64, mime: PNG }));
    assertEquals(ok.status, 200, "the control image string was refused");
  });
}

Deno.test("CAL-019 AC-5: valid base64 using every alphabet character, '+' and '/' included, is accepted", async () => {
  const w = world();
  const all =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const { status } = await run(w, post({ image: all, mime: PNG }));
  assertEquals(status, 200);
});

Deno.test("CAL-019 AC-5: one '=' of padding is accepted (YWI= is the two bytes 'ab')", async () => {
  const w = world();
  const { status } = await run(w, post({ image: "YWI=", mime: PNG }));
  assertEquals(status, 200);
  // sha256sum of the two bytes "ab"
  assertEquals(
    jobBody(w).input_hash,
    "fb8e20fc2e4c3f248c60c39bd652f3c1347298bb977b8b4d5903b85055620603",
  );
});

// ---------------------------------------------------------------- check order

Deno.test("CAL-019 order: no bearer token and a bad image is 401, not 400", async () => {
  const w = world();
  const { status } = await run(
    w,
    post({ image: "!!!!", mime: "image/gif" }, null),
  );
  assertEquals(status, 401);
  assertEquals(w.keys(), []);
});

Deno.test("CAL-019 order: an image that is not a string with an unsupported mime is 400, not 415", async () => {
  const w = world();
  const { status } = await run(w, post({ image: 5, mime: "image/gif" }));
  assertEquals(status, 400);
  assertEquals(w.keys(), []);
  // Control: the same mime with a string image is 415, so the 400 above is
  // the string check coming first, not an absent MIME check.
  const control = await run(
    world(),
    post({ image: ABC_B64, mime: "image/gif" }),
  );
  assertEquals(control.status, 415);
});

Deno.test("CAL-019 order: base64 that does not decode with an unsupported mime is 415, not 400", async () => {
  const w = world();
  const { status } = await run(w, post({ image: "!!!!", mime: "image/gif" }));
  assertEquals(status, 415);
  assertEquals(w.keys(), []);
});

Deno.test("CAL-019 order: an oversized image with an unsupported mime is 415, not 413", async () => {
  const w = world();
  const { status } = await run(
    w,
    post({ image: OVER_LIMIT_B64, mime: "image/gif" }),
  );
  assertEquals(status, 415);
  assertEquals(w.keys(), []);
});

Deno.test("CAL-019 order: a 5.6 MB string that is not base64 is 400, not 413", async () => {
  const notBase64 = "A".repeat(5_600_000) + "!!!!";
  const w = world();
  const { status, body } = await run(w, post({ image: notBase64, mime: PNG }));
  assertEquals(status, 400);
  assertEquals(body, { error: "bad_request" });
  assertEquals(w.keys(), []);
  // Control: the same length of valid base64 (4,200,003 decoded bytes) is
  // 413, so the 400 above is the base64 check coming first, not an absent
  // size check.
  const sameLength = "A".repeat(notBase64.length);
  const control = await run(world(), post({ image: sameLength, mime: PNG }));
  assertEquals(control.status, 413);
});

Deno.test("CAL-019 order: a valid image from a non-owner is 403 after the owner check, and Gemini is never called", async () => {
  const w = world({ owner: () => json(false) });
  const { status, body } = await run(
    w,
    post({ image: ABC_B64, mime: PNG }, "Bearer x-jwt"),
  );
  assertEquals(status, 403);
  assertEquals(body, { error: "forbidden" });
  assertEquals(w.keys(), [OWNER]);
});

Deno.test("CAL-019 order: a bad image from a non-owner is 400 and nothing is fetched", async () => {
  const w = world({ owner: () => json(false) });
  const { status } = await run(
    w,
    post({ image: "YW-j", mime: PNG }, "Bearer x-jwt"),
  );
  assertEquals(status, 400);
  assertEquals(w.keys(), []);
  // Control: a good image from the same stranger reaches the owner check.
  const cw = world({ owner: () => json(false) });
  const control = await run(
    cw,
    post({ image: "YW+j", mime: PNG }, "Bearer x-jwt"),
  );
  assertEquals(control.status, 403);
  assertEquals(cw.keys(), [OWNER]);
});

// ---------------------------------------------------------------- AC-3

Deno.test("CAL-019 AC-3: with both text and image only the image is sent: the user's text is in no part of the Gemini request", async () => {
  const w = world();
  const { status } = await run(
    w,
    post({ text: TEXT, image: ABC_B64, mime: PNG }),
  );
  assertEquals(status, 200);
  const raw = w.call(GEMINI).body;
  assert(!raw.includes(TEXT), "the Gemini request carries the user's text");
  assert(
    !raw.includes("QX-77812"),
    "the Gemini request carries part of the user's text",
  );
  const req = geminiBody(w);
  assertEquals(req.contents[0]!.parts[0], {
    inline_data: { mime_type: PNG, data: ABC_B64 },
  });
  imagePromptPart(req);
});

Deno.test("CAL-019 AC-3: with both text and image the job row is the image's: input_kind image and the hash of the decoded bytes, not of the text", async () => {
  const w = world();
  await run(w, post({ text: TEXT, image: ABC_B64, mime: PNG }));
  const row = jobBody(w);
  assertEquals(row.input_kind, "image");
  assertEquals(row.input_hash, ABC_BYTES_SHA256);
  assert(row.input_hash !== (await sha256Hex(TEXT)), "the row hashes the text");
});

Deno.test("CAL-019 AC-3: when image is present the text is ignored entirely, so an empty, blank, non-string or over-long text does not make it 400", async () => {
  for (const text of ["", "   ", 5, "a".repeat(20_001)]) {
    const w = world();
    const { status } = await run(w, post({ text, image: ABC_B64, mime: PNG }));
    assertEquals(
      status,
      200,
      `text ${JSON.stringify(text).slice(0, 20)} made it ${status}`,
    );
  }
});

Deno.test("CAL-019 AC-3: a valid text does not rescue a bad image: text plus undecodable base64 is 400", async () => {
  const w = world();
  const { status } = await run(
    w,
    post({ text: TEXT, image: "YW-j", mime: PNG }),
  );
  assertEquals(status, 400);
  assertEquals(w.keys(), []);
});

Deno.test("CAL-019 AC-3: an image key holding null takes the image path, so text plus image null is 400, not a text capture", async () => {
  const w = world();
  const { status } = await run(
    w,
    post({ text: TEXT, image: null, mime: PNG }),
  );
  assertEquals(status, 400);
  assertEquals(w.keys(), []);
});

Deno.test("CAL-019: a text body with a stray mime and no image key is still a text capture", async () => {
  const w = world();
  const { status } = await run(w, post({ text: TEXT, mime: PNG }));
  assertEquals(status, 200);
  assertEquals(jobBody(w).input_kind, "text");
  assertEquals(geminiBody(w).contents[0]!.parts.length, 1);
});
