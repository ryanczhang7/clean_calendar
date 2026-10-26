import { assert, assertEquals } from "@std/assert";
import {
  buildGeminiRequest,
  callGemini,
  DEFAULT_GEMINI_API_BASE,
  GEMINI_MODEL,
  geminiResponseSchema,
  geminiUrl,
} from "./gemini.ts";
import { buildPrompt } from "./prompt.ts";

// CAL-018 Contract Block 3 (AC-1). URL, model, headers and generationConfig
// keys are SETTLED: read out of the Contract and the Gemini REST reference,
// not calibrated. The reply path is candidates[0].content.parts[0].text.

const BASE = "http://127.0.0.1:9999";
const KEY = "gem-key-test-5f3a9c";
const URL_ = `${BASE}/v1beta/models/gemini-2.5-flash:generateContent`;
const FIELDS = ["title", "startsAt", "endsAt", "location", "kind"];

type Seen = { method: string; url: string; headers: Headers; body: string };

/** A fetch that records each call and answers with `reply`; the clock moves 250 ms inside it. */
function stub(reply: () => Response) {
  let t = 5_000;
  const seen: Seen[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    seen.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: await req.text(),
    });
    t += 250;
    return reply();
  }) as typeof globalThis.fetch;
  return { fetch, seen, now: () => t };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lower(v: unknown): string {
  return String(v).toLowerCase();
}

Deno.test("the model is gemini-2.5-flash and the default base is Google's API host", () => {
  assertEquals(GEMINI_MODEL, "gemini-2.5-flash");
  assertEquals(
    DEFAULT_GEMINI_API_BASE,
    "https://generativelanguage.googleapis.com",
  );
});

Deno.test("geminiUrl is {base}/v1beta/models/gemini-2.5-flash:generateContent", () => {
  assertEquals(geminiUrl(BASE), URL_);
  assertEquals(
    geminiUrl("https://generativelanguage.googleapis.com"),
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
});

Deno.test("geminiUrl drops a trailing slash on the base rather than doubling it", () => {
  assertEquals(geminiUrl(`${BASE}/`), URL_);
});

Deno.test("the request is one user turn carrying the prompt, asking for JSON against the schema at temperature 0", () => {
  const req = buildGeminiRequest("PROMPT TEXT");
  assertEquals(req.contents, [
    { role: "user", parts: [{ text: "PROMPT TEXT" }] },
  ]);
  assertEquals(req.generationConfig.responseMimeType, "application/json");
  assertEquals(req.generationConfig.temperature, 0);
  assertEquals(req.generationConfig.responseSchema, geminiResponseSchema);
});

Deno.test("the response schema requires proposal, confidence and missing", () => {
  const s = geminiResponseSchema as {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
  assertEquals(lower(s.type), "object");
  assertEquals(Object.keys(s.properties).sort(), [
    "confidence",
    "missing",
    "proposal",
  ]);
  assertEquals([...s.required].sort(), ["confidence", "missing", "proposal"]);
});

Deno.test("the response schema's proposal has exactly the six proposal fields", () => {
  const p = (geminiResponseSchema as {
    properties: { proposal: { type: string; properties: object } };
  }).properties.proposal;
  assertEquals(lower(p.type), "object");
  assertEquals(Object.keys(p.properties).sort(), [
    "allDay",
    "endsAt",
    "kindName",
    "location",
    "startsAt",
    "title",
  ]);
});

Deno.test("the response schema's confidence is keyed by the capture vocabulary, and missing is an array of it", () => {
  const props = (geminiResponseSchema as {
    properties: {
      confidence: { properties: object };
      missing: { type: string; items: { enum: string[] } };
    };
  }).properties;
  assertEquals(
    Object.keys(props.confidence.properties).sort(),
    [...FIELDS].sort(),
  );
  assertEquals(lower(props.missing.type), "array");
  assertEquals([...props.missing.items.enum].sort(), [...FIELDS].sort());
});

Deno.test("callGemini makes exactly one POST to the model URL with the key in x-goog-api-key and a JSON body", async () => {
  const s = stub(() => json({ candidates: [] }));
  await callGemini({
    prompt: "the prompt",
    apiKey: KEY,
    base: BASE,
    fetch: s.fetch,
    now: s.now,
  });
  assertEquals(s.seen.length, 1);
  const call = s.seen[0]!;
  assertEquals(call.method, "POST");
  assertEquals(call.url, URL_);
  assertEquals(call.headers.get("x-goog-api-key"), KEY);
  assert(
    (call.headers.get("content-type") ?? "").startsWith("application/json"),
    `content-type was ${call.headers.get("content-type")}`,
  );
  assert(!call.url.includes(KEY), "the key is in the URL");
  assertEquals(JSON.parse(call.body), buildGeminiRequest("the prompt"));
});

Deno.test("a 200 reply yields the text of candidates[0].content.parts[0] and the latency around the call", async () => {
  const s = stub(() =>
    json({
      candidates: [{
        content: { role: "model", parts: [{ text: '{"a":1}' }] },
        finishReason: "STOP",
      }],
    })
  );
  const out = await callGemini({
    prompt: "p",
    apiKey: KEY,
    base: BASE,
    fetch: s.fetch,
    now: s.now,
  });
  assertEquals(out, { kind: "reply", text: '{"a":1}', latencyMs: 250 });
});

Deno.test("a 200 with no candidate is a reply with empty text, which the handler's schema step rejects", async () => {
  for (const body of [{ candidates: [] }, {}, { candidates: [{}] }]) {
    const s = stub(() => json(body));
    const out = await callGemini({
      prompt: "p",
      apiKey: KEY,
      base: BASE,
      fetch: s.fetch,
      now: s.now,
    });
    assertEquals(
      out,
      { kind: "reply", text: "", latencyMs: 250 },
      `for ${JSON.stringify(body)}`,
    );
  }
});

Deno.test("a non-2xx is an http outcome carrying the status", async () => {
  const s = stub(() => json({ error: { code: 503 } }, 503));
  const out = await callGemini({
    prompt: "p",
    apiKey: KEY,
    base: BASE,
    fetch: s.fetch,
    now: s.now,
  });
  assertEquals(out, { kind: "http", status: 503, latencyMs: 250 });
});

Deno.test("a fetch that throws is a network outcome, not an exception", async () => {
  const s = stub(() => {
    throw new TypeError("connection refused");
  });
  const out = await callGemini({
    prompt: "p",
    apiKey: KEY,
    base: BASE,
    fetch: s.fetch,
    now: s.now,
  });
  assertEquals(out, { kind: "network", latencyMs: 250 });
});

Deno.test("the prompt contains the text verbatim and every kind name verbatim", () => {
  const text = "Table for 4 at Rosa's, Fri 7pm.\nConfirmation #A1-22";
  const kinds = ["Work", "Physio & Rehab", "Kids' clubs"];
  const prompt = buildPrompt(text, kinds);
  assert(prompt.includes(text), "the prompt does not contain the text");
  for (const k of kinds) assert(prompt.includes(k), `no kind ${k}`);
});

Deno.test("a prompt for an owner with no kinds still carries the text", () => {
  const prompt = buildPrompt("Dentist Tue 9:30", []);
  assert(prompt.includes("Dentist Tue 9:30"));
});
