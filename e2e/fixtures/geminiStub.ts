import { createServer, type Server } from "node:http";

// CAL-031 Contract Block 3: the Gemini stand-in the capture function calls
// during the integration gate (`GEMINI_API_BASE`, e2e/fixtures/functions.env).
// A plain node:http server with no dependency; `node e2e/fixtures/geminiStub.ts`
// runs it (Node 24 strips the types), and the specs import the pure exports
// below to know what it proposes.

export const STUB_PORT = 4174;
export const STUB_ORIGIN = `http://127.0.0.1:${STUB_PORT}`;

/** The path `geminiUrl()` builds for GEMINI_MODEL (supabase/functions/capture/gemini.ts). */
export const GENERATE_PATH = "/v1beta/models/gemini-3.8-flash:generateContent";

/** The proposed day: the 15th of the month `now` is in. */
export const PROPOSED_DAY_OF_MONTH = 15;

/**
 * The proposal's start: the 15th of `now`'s month at 10:00 LOCAL time, as an
 * ISO instant. The stub and the browser run on one machine, so they share the
 * time zone and "the proposed day" is one month gridcell the spec can name.
 */
export function proposedStart(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), PROPOSED_DAY_OF_MONTH, 10);
}

/** The fixed reply, in shared/captureSchema.ts's vocabulary: End is missing. */
export function stubReply(now: Date = new Date()) {
  return {
    proposal: {
      title: "Flight to Tokyo",
      startsAt: proposedStart(now).toISOString(),
      endsAt: null,
      allDay: false,
      location: "NRT",
      kindName: "Flights",
    },
    confidence: {
      title: 0.9,
      startsAt: 0.9,
      endsAt: 0,
      location: 0.8,
      kind: 0.9,
    },
    missing: ["endsAt"],
  };
}

/** The generateContent body Gemini returns, carrying `stubReply` as its text. */
export function generateContentBody(now: Date = new Date()) {
  return {
    candidates: [
      { content: { parts: [{ text: JSON.stringify(stubReply(now)) }] } },
    ],
  };
}

export type StubRequests = { count: number };

/** The stub's own counter, read by AC-3 (`GET /__requests`). */
export async function stubRequests(): Promise<StubRequests> {
  const res = await fetch(`${STUB_ORIGIN}/__requests`);
  return (await res.json()) as StubRequests;
}

/** `POST /__reset`: the count goes back to 0. */
export async function resetStub(): Promise<void> {
  const res = await fetch(`${STUB_ORIGIN}/__reset`, { method: "POST" });
  await res.body?.cancel();
}

export function startStub(port: number = STUB_PORT): Server {
  let count = 0;
  const server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    // Drain the body whatever the path, so the connection is reusable.
    req.resume();
    req.on("end", () => {
      const path = (req.url ?? "").split("?")[0];
      if (req.method === "POST" && path === GENERATE_PATH) {
        count += 1;
        send(200, generateContentBody());
      } else if (req.method === "GET" && path === "/__requests") {
        send(200, { count });
      } else if (req.method === "POST" && path === "/__reset") {
        count = 0;
        send(200, { count });
      } else if (req.method === "GET" && path === "/__health") {
        send(200, { ok: true });
      } else {
        send(404, { error: "stub" });
      }
    });
  });
  // All interfaces: the edge-runtime container reaches it through
  // host.docker.internal, which is not the host's loopback.
  server.listen(port, "0.0.0.0");
  return server;
}

// Run as `node e2e/fixtures/geminiStub.ts`; imported by a spec or the config,
// it only exports. (Not `import.meta.main`: Playwright may load this module as
// CommonJS, where `import.meta` is a syntax error.)
if (/geminiStub\.ts$/.test(process.argv[1] ?? "")) {
  startStub();
}
