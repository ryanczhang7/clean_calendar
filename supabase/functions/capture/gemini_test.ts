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

// ================================================================ CAL-019
//
// CAL-019 Contract Blocks 2 and 3: the image part and the image prompt. The
// new exports and the widened signatures are reached through namespace
// imports, cast to the Contract's shapes: Deno type-checks the whole test
// graph first, so a named import of a missing export, or a second argument the
// current signature lacks, would take every existing test dark. Read this way,
// each absence fails exactly the test that needs it, at run time.

import * as geminiModule from "./gemini.ts";
import * as promptModule from "./prompt.ts";

/** Contract Block 2's InlineImage: the base64 exactly as received. */
type InlineImageShape = { mimeType: string; data: string };

const buildGeminiRequestWithImage = geminiModule
  .buildGeminiRequest as unknown as (
    prompt: string,
    image?: InlineImageShape,
  ) => {
    contents: { role: string; parts: Record<string, unknown>[] }[];
    generationConfig: Record<string, unknown>;
  };

const callGeminiWithImage = geminiModule.callGemini as unknown as (
  args: Parameters<typeof callGemini>[0] & { image?: InlineImageShape },
) => ReturnType<typeof callGemini>;

function buildImagePrompt(kindNames: readonly string[]): string {
  const fn = (promptModule as Record<string, unknown>).buildImagePrompt;
  assertEquals(
    typeof fn,
    "function",
    "prompt.ts does not export buildImagePrompt",
  );
  return (fn as (k: readonly string[]) => string)(kindNames);
}

const IMAGE: InlineImageShape = { mimeType: "image/webp", data: "//4AgA==" };

Deno.test("CAL-019 AC-1: with an image the request's parts are exactly [inline_data {mime_type, data}, the prompt text], image first", () => {
  const req = buildGeminiRequestWithImage("PROMPT TEXT", IMAGE);
  assertEquals(req.contents, [
    {
      role: "user",
      parts: [
        { inline_data: { mime_type: "image/webp", data: "//4AgA==" } },
        { text: "PROMPT TEXT" },
      ],
    },
  ]);
});

Deno.test("CAL-019 AC-1: an image request keeps the text request's generationConfig while its parts gain the image", () => {
  const withImage = buildGeminiRequestWithImage("P", IMAGE);
  assertEquals(
    withImage.generationConfig,
    buildGeminiRequest("P").generationConfig,
  );
  assertEquals(
    withImage.contents[0]!.parts.length,
    2,
    "the image argument was ignored",
  );
});

Deno.test("CAL-019 AC-1: the inline data is the base64 as given, not re-encoded or trimmed", () => {
  const data = "Qm9va2luZyByZWYgUVgtNzc4MTIgc2NyZWVuc2hvdA==";
  const req = buildGeminiRequestWithImage("P", { mimeType: "image/png", data });
  const part = req.contents[0]!.parts[0] as {
    inline_data?: { mime_type: string; data: string };
  };
  assert(part.inline_data !== undefined, "the first part is not inline_data");
  assert(part.inline_data.data === data, `data was ${part.inline_data.data}`);
  assertEquals(part.inline_data.mime_type, "image/png");
});

Deno.test("CAL-019: an explicitly undefined image builds a text-only request, one text part and nothing else", () => {
  assertEquals(buildGeminiRequestWithImage("P", undefined).contents, [
    { role: "user", parts: [{ text: "P" }] },
  ]);
  assertEquals(
    buildGeminiRequestWithImage("P", undefined),
    buildGeminiRequest("P"),
  );
});

Deno.test("CAL-019 AC-1: callGemini with an image posts [inline_data, text] to the same URL with the same key header", async () => {
  const s = stub(() => json({ candidates: [] }));
  await callGeminiWithImage({
    prompt: "the prompt",
    image: { mimeType: "image/jpeg", data: "YWJj" },
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
  const body = JSON.parse(call.body);
  assertEquals(body.contents, [
    {
      role: "user",
      parts: [
        { inline_data: { mime_type: "image/jpeg", data: "YWJj" } },
        { text: "the prompt" },
      ],
    },
  ]);
  assertEquals(body.generationConfig, buildGeminiRequest("x").generationConfig);
});

Deno.test("CAL-019 AC-1: the image prompt names every kind verbatim", () => {
  const kinds = ["Work", "Physio & Rehab", "Kids' clubs"];
  const prompt = buildImagePrompt(kinds);
  for (const k of kinds) assert(prompt.includes(k), `no kind ${k}`);
});

Deno.test("CAL-019 AC-1: the image prompt has no <<< >>> text delimiters, since it carries no user text", () => {
  const prompt = buildImagePrompt(["Work"]);
  assert(!prompt.includes("<<<"), "the image prompt carries <<<");
  assert(!prompt.includes(">>>"), "the image prompt carries >>>");
});

Deno.test("CAL-019 AC-1: the image prompt tells the model the event is in the attached image", () => {
  const prompt = buildImagePrompt(["Work"]);
  assert(
    /image|screenshot/i.test(prompt),
    "the image prompt never mentions the image or screenshot",
  );
});

Deno.test("CAL-019 AC-1: the image prompt for an owner with no kinds is still a prompt, and differs from one with kinds", () => {
  const none = buildImagePrompt([]);
  assertEquals(typeof none, "string");
  assert(none.length > 0, "the image prompt is empty");
  assert(none !== buildImagePrompt(["Work"]), "the kinds make no difference");
});
