import { assert, assertEquals } from "@std/assert";
import { requireOwner } from "./owner.ts";

// CAL-018 Contract Block 4 (AC-4). The owner check is one PostgREST rpc of
// public.is_owner() made with the CALLER's JWT; anything but a literal `true`
// is 403. The stub fetch records every call, and the tests assert the exact
// list, so a second or missing call is a failure rather than bookkeeping.

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON = "anon-key-test";
const RPC_URL = `${SUPABASE_URL}/rest/v1/rpc/is_owner`;

type Seen = {
  method: string;
  url: string;
  headers: Headers;
  body: string;
};

function env(name: string): string | undefined {
  return ({ SUPABASE_URL, SUPABASE_ANON_KEY: ANON } as Record<string, string>)[
    name
  ];
}

/** A fetch that answers the rpc with `reply` and throws on any other URL. */
function stubFetch(reply: () => Response) {
  const seen: Seen[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    seen.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: await req.text(),
    });
    if (req.url !== RPC_URL) throw new Error(`unexpected fetch ${req.url}`);
    return reply();
  }) as typeof globalThis.fetch;
  return { fetch, seen };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** CAL-047 AC-3: a refusal the browser can read, so it is not mistaken for "offline". */
function assertCors(res: Response) {
  assertEquals(
    res.headers.get("access-control-allow-origin"),
    "*",
    `requireOwner's ${res.status} has no Access-Control-Allow-Origin: *, so the browser cannot read it`,
  );
}

function request(authorization?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request(`${SUPABASE_URL}/functions/v1/capture`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text: "x" }),
  });
}

Deno.test("no Authorization header is 401 unauthorized, and nothing is fetched", async () => {
  const { fetch, seen } = stubFetch(() => json(true));
  const res = await requireOwner(request(), { fetch, env });
  assert(res !== null, "expected a 401 Response, got null (owner)");
  assertEquals(res.status, 401);
  assertCors(res);
  assertEquals(await res.json(), { error: "unauthorized" });
  assertEquals(seen.length, 0);
});

Deno.test("an Authorization header that is not a Bearer token is 401, and nothing is fetched", async () => {
  const { fetch, seen } = stubFetch(() => json(true));
  const res = await requireOwner(request("Basic dXNlcjpwYXNz"), {
    fetch,
    env,
  });
  assert(res !== null, "expected a 401 Response, got null (owner)");
  assertEquals(res.status, 401);
  assertCors(res);
  assertEquals(await res.json(), { error: "unauthorized" });
  assertEquals(seen.length, 0);
});

Deno.test("is_owner() answering literal true admits the caller (null, no response)", async () => {
  const { fetch, seen } = stubFetch(() => json(true));
  const res = await requireOwner(request("Bearer owner-jwt"), { fetch, env });
  assertEquals(res, null);
  assertEquals(seen.length, 1);
});

Deno.test("the owner check is one POST to /rest/v1/rpc/is_owner with the anon key, the caller's JWT and an empty JSON body", async () => {
  const { fetch, seen } = stubFetch(() => json(true));
  await requireOwner(request("Bearer owner-jwt"), { fetch, env });
  assertEquals(seen.length, 1);
  const call = seen[0]!;
  assertEquals(call.method, "POST");
  assertEquals(call.url, RPC_URL);
  assertEquals(call.headers.get("apikey"), ANON);
  assertEquals(call.headers.get("authorization"), "Bearer owner-jwt");
  assert(
    (call.headers.get("content-type") ?? "").startsWith("application/json"),
    `content-type was ${call.headers.get("content-type")}`,
  );
  assertEquals(JSON.parse(call.body), {});
});

Deno.test("is_owner() answering false is 403 forbidden", async () => {
  const { fetch } = stubFetch(() => json(false));
  const res = await requireOwner(request("Bearer stranger-jwt"), {
    fetch,
    env,
  });
  assert(res !== null, "a non-owner was admitted");
  assertEquals(res.status, 403);
  assertCors(res);
  assertEquals(await res.json(), { error: "forbidden" });
});

Deno.test("is_owner() answering null is 403 forbidden", async () => {
  const { fetch } = stubFetch(() => json(null));
  const res = await requireOwner(request("Bearer stranger-jwt"), {
    fetch,
    env,
  });
  assert(res !== null, "a null answer admitted the caller");
  assertEquals(res.status, 403);
  assertCors(res);
  assertEquals(await res.json(), { error: "forbidden" });
});

Deno.test('is_owner() answering the string "true" is 403: only the literal boolean admits', async () => {
  const { fetch } = stubFetch(() => json("true"));
  const res = await requireOwner(request("Bearer stranger-jwt"), {
    fetch,
    env,
  });
  assert(res !== null, 'the string "true" admitted the caller');
  assertEquals(res.status, 403);
  assertCors(res);
});

Deno.test("a non-2xx from PostgREST is 403 even when its body says true", async () => {
  const { fetch } = stubFetch(() => json(true, 500));
  const res = await requireOwner(request("Bearer owner-jwt"), { fetch, env });
  assert(res !== null, "a 500 admitted the caller");
  assertEquals(res.status, 403);
  assertCors(res);
  assertEquals(await res.json(), { error: "forbidden" });
});

Deno.test("a 401 from PostgREST (a JWT it will not accept) is 403 forbidden", async () => {
  const { fetch } = stubFetch(() =>
    json({ code: "PGRST301", message: "JWT expired" }, 401)
  );
  const res = await requireOwner(request("Bearer expired-jwt"), {
    fetch,
    env,
  });
  assert(res !== null, "a rejected JWT admitted the caller");
  assertEquals(res.status, 403);
  assertCors(res);
});

Deno.test("the 401 and 403 responses are application/json", async () => {
  const { fetch } = stubFetch(() => json(false));
  const none = await requireOwner(request(), { fetch, env });
  const denied = await requireOwner(request("Bearer stranger-jwt"), {
    fetch,
    env,
  });
  for (const res of [none, denied]) {
    assert(res !== null);
    assert(
      (res.headers.get("content-type") ?? "").startsWith("application/json"),
      `content-type was ${res.headers.get("content-type")}`,
    );
  }
});

Deno.test("an owner check whose fetch throws (network failure) is 403 forbidden, readable cross-origin", async () => {
  const fetch = (() => {
    throw new TypeError("connection refused");
  }) as typeof globalThis.fetch;
  const res = await requireOwner(request("Bearer owner-jwt"), { fetch, env });
  assert(res !== null, "a network failure admitted the caller");
  assertEquals(res.status, 403);
  assertCors(res);
  assertEquals(await res.json(), { error: "forbidden" });
});
