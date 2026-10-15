import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import type { Database } from "../data/database.types";

// The shared MSW harness for repository tests (CAL-005 Contract, Test
// harness). A repository is handed a real supabase-js client pointed at
// TEST_ORIGIN; every PostgREST call it makes is a real fetch to
// http://supabase.test/rest/v1/<table>, which MSW intercepts at the HTTP
// boundary. A request no handler answers fails the test
// (onUnhandledRequest: "error"), so a call to the wrong path cannot pass.
//
// Usage, once per file at the top level:
//
//   installServer();
//   server.use(http.get(`${TEST_ORIGIN}/rest/v1/kinds`, ({ request }) => ...));

export const server = setupServer();

export function installServer(): void {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });
}

export const TEST_ORIGIN = "http://supabase.test";

// One request as the server saw it. `body` is the parsed JSON body, or
// `undefined` when the request carried none (a GET).
export type Recorded = {
  method: string;
  url: URL;
  prefer: string | null;
  body: unknown;
};

// Answers EVERY method on /rest/v1/<table> with `respond`, and records each
// request. Matching all methods is deliberate: a DELETE where a PATCH was
// required is recorded and asserted against, rather than surfacing only as
// MSW's generic unhandled-request error.
export function onTable(
  table: string,
  respond: (req: Recorded) => Response | Promise<Response>,
): Recorded[] {
  const seen: Recorded[] = [];
  server.use(
    http.all(`${TEST_ORIGIN}/rest/v1/${table}`, async ({ request }) => {
      const text = await request.text();
      const rec: Recorded = {
        method: request.method,
        url: new URL(request.url),
        prefer: request.headers.get("prefer"),
        body: text === "" ? undefined : JSON.parse(text),
      };
      seen.push(rec);
      return respond(rec);
    }),
  );
  return seen;
}

// A PostgREST error body as the server sends it.
export function pgError(status: number, code: string, message: string) {
  return HttpResponse.json(
    { code, message, details: null, hint: null },
    { status },
  );
}

// The tokens of a Prefer header, e.g. ["return=representation"].
export function preferTokens(prefer: string | null): string[] {
  return (prefer ?? "").split(",").map((t) => t.trim());
}

// `db: { retry: false }`: postgrest-js 2.117 retries an idempotent request
// (GET/HEAD/OPTIONS) whose fetch rejects up to 3 times, sleeping 1 s, 2 s and
// 4 s - measured 2026-10-15 at 7.0 s and 4 requests for one offline GET (CAL-005
// Contract, Test harness). Retrying is a property of the client the caller
// builds, not of a repository, so the test client turns it off and an offline
// read resolves in one request.
export function testClient(): SupabaseClient<Database> {
  return createClient<Database>(TEST_ORIGIN, "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { retry: false },
  });
}
