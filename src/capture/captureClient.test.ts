import { createClient } from "@supabase/supabase-js";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptureResponse } from "../../shared/captureSchema";
import type { Database } from "../data/database.types";
import { installServer, server, TEST_ORIGIN } from "../test/msw";
import { type CaptureInput, proposeEvent } from "./captureClient";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-020 Contract, Block 1 (AC-2, AC-3, AC-4). `proposeEvent` drives the
// REAL supabase-js 2.117 functions client - the mocked `../lib/supabase` is a
// real client aimed at TEST_ORIGIN (src/test/supabase-mock.ts) - and MSW
// answers `POST http://supabase.test/functions/v1/capture` at the HTTP
// boundary. Measured in RED (2026-10-26, local, functions-js 2.117.3):
//   * invoke("capture", { body }) sends POST /functions/v1/capture with
//     content-type application/json, the JSON body, `apikey` and an
//     `authorization: Bearer ...` header, and no query string;
//   * a non-2xx reply comes back as { data: null, error: FunctionsHttpError }
//     whose `context` is the Response (its JSON body still readable);
//   * a reply carrying `x-relay-error: true` is a FunctionsRelayError, also
//     with the Response as `context`;
//   * a rejected fetch is a FunctionsFetchError;
//   * a 2xx reply is parsed by content type: JSON -> object, else text.
// MECHANICAL: every outcome below is pinned with toStrictEqual.

installServer();

const FN = `${TEST_ORIGIN}/functions/v1/capture`;
const JOB_ID = "0b6c2a7e-3f4d-4c1a-9e2b-7d8f9a0b1c2d";

const RESPONSE: CaptureResponse = {
  proposal: {
    title: "Dinner at Lupa",
    startsAt: "2026-11-03T19:30:00+01:00",
    endsAt: null,
    allDay: false,
    location: "Lupa, Via Roma 1",
    kindName: "Dining",
  },
  confidence: { title: 0.9, startsAt: 0.8 },
  missing: ["endsAt"],
  jobId: JOB_ID,
};

type Seen = {
  method: string;
  url: URL;
  headers: Headers;
  body: string;
};

/** Answer the function with `respond`, recording every request. */
function onCapture(respond: () => Response, origin = TEST_ORIGIN): Seen[] {
  const seen: Seen[] = [];
  server.use(
    http.all(`${origin}/functions/v1/capture`, async ({ request }) => {
      seen.push({
        method: request.method,
        url: new URL(request.url),
        headers: request.headers,
        body: await request.text(),
      });
      return respond();
    }),
  );
  return seen;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what is sent (Block 1)", () => {
  it("text is POSTed to /functions/v1/capture as the JSON body {text}, exactly", async () => {
    const seen = onCapture(() => HttpResponse.json(RESPONSE));
    await proposeEvent({ text: "Table for two, 3 Nov 19:30" });
    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("POST");
    expect(req?.url.href).toBe(FN);
    expect(req?.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(req?.body ?? "")).toStrictEqual({
      text: "Table for two, 3 Nov 19:30",
    });
  });

  it("an image is POSTed as the JSON body {image, mime}, exactly, with no text key", async () => {
    const seen = onCapture(() => HttpResponse.json(RESPONSE));
    const input: CaptureInput = { image: "iVBORw0KGgo=", mime: "image/png" };
    await proposeEvent(input);
    expect(seen).toHaveLength(1);
    expect(JSON.parse(seen[0]?.body ?? "")).toStrictEqual({
      image: "iVBORw0KGgo=",
      mime: "image/png",
    });
  });

  it("the request carries a bearer token and the apikey, as the function requires", async () => {
    const seen = onCapture(() => HttpResponse.json(RESPONSE));
    await proposeEvent({ text: "x" });
    expect(seen[0]?.headers.get("authorization")).toMatch(/^Bearer \S+$/);
    expect(seen[0]?.headers.get("apikey")).toBe("test-anon-key");
  });

  it("uses the client it is handed, not the app's", async () => {
    const other = createClient<Database>("http://other.test", "other-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const seen = onCapture(
      () => HttpResponse.json(RESPONSE),
      "http://other.test",
    );
    const outcome = await proposeEvent({ text: "x" }, other);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.headers.get("apikey")).toBe("other-key");
    expect(outcome.status).toBe("ok");
  });
});

describe("a readable reply is ok (AC-2)", () => {
  it("a 200 whose JSON passes captureResponseSchema resolves ok with that response", async () => {
    onCapture(() => HttpResponse.json(RESPONSE));
    await expect(proposeEvent({ text: "x" })).resolves.toStrictEqual({
      status: "ok",
      response: RESPONSE,
    });
  });

  it("a 200 whose JSON fails the schema (jobId not a uuid) is error unreadable, with no http status", async () => {
    onCapture(() => HttpResponse.json({ ...RESPONSE, jobId: "job-1" }));
    await expect(proposeEvent({ text: "x" })).resolves.toStrictEqual({
      status: "error",
      code: "unreadable",
    });
  });

  it("a 200 carrying an extra proposal key (the schema is strict) is error unreadable", async () => {
    onCapture(() =>
      HttpResponse.json({
        ...RESPONSE,
        proposal: { ...RESPONSE.proposal, notes: "extra" },
      }),
    );
    await expect(proposeEvent({ text: "x" })).resolves.toStrictEqual({
      status: "error",
      code: "unreadable",
    });
  });

  it("a 200 that is not JSON at all is error unreadable", async () => {
    onCapture(() => HttpResponse.text("<html>ok</html>"));
    await expect(proposeEvent({ text: "x" })).resolves.toStrictEqual({
      status: "error",
      code: "unreadable",
    });
  });
});

describe("a refusal is an error with the function's code (AC-4)", () => {
  it.each([
    [502, "upstream"],
    [502, "unreadable"],
    [400, "bad_request"],
    [413, "payload_too_large"],
    [415, "unsupported_media_type"],
    [403, "forbidden"],
    [401, "unauthorized"],
  ] as const)(
    "HTTP %i {error: %j} -> error with that code and http %i",
    async (status, code) => {
      onCapture(() => HttpResponse.json({ error: code }, { status }));
      await expect(proposeEvent({ text: "x" })).resolves.toStrictEqual({
        status: "error",
        code,
        http: status,
      });
    },
  );

  it('a code the client does not know ("method_not_allowed", 405) is "unknown", keeping the status', async () => {
    onCapture(() =>
      HttpResponse.json({ error: "method_not_allowed" }, { status: 405 }),
    );
    await expect(proposeEvent({ text: "x" })).resolves.toStrictEqual({
      status: "error",
      code: "unknown",
      http: 405,
    });
  });

  it('a non-2xx whose body is not JSON (a gateway page) is "unknown", keeping the status', async () => {
    onCapture(
      () =>
        new HttpResponse("<html>Bad gateway</html>", {
          status: 500,
          headers: { "content-type": "text/html" },
        }),
    );
    await expect(proposeEvent({ text: "x" })).resolves.toStrictEqual({
      status: "error",
      code: "unknown",
      http: 500,
    });
  });

  it('a non-2xx JSON body without an "error" string is "unknown"', async () => {
    onCapture(() => HttpResponse.json({ message: "nope" }, { status: 400 }));
    await expect(proposeEvent({ text: "x" })).resolves.toStrictEqual({
      status: "error",
      code: "unknown",
      http: 400,
    });
  });

  it('a relay error (x-relay-error: true) is "upstream", keeping the status (RED amendment to Block 1)', async () => {
    onCapture(
      () =>
        new HttpResponse("relay", {
          status: 502,
          headers: { "x-relay-error": "true" },
        }),
    );
    await expect(proposeEvent({ text: "x" })).resolves.toStrictEqual({
      status: "error",
      code: "upstream",
      http: 502,
    });
  });
});

describe("no connection is offline (AC-4)", () => {
  it("a fetch that fails (FunctionsFetchError) resolves offline", async () => {
    onCapture(() => HttpResponse.error());
    await expect(proposeEvent({ text: "x" })).resolves.toStrictEqual({
      status: "offline",
    });
  });

  it("navigator.onLine false resolves offline without sending anything", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const seen = onCapture(() => HttpResponse.json(RESPONSE));
    await expect(proposeEvent({ text: "x" })).resolves.toStrictEqual({
      status: "offline",
    });
    expect(seen).toHaveLength(0);
  });
});
