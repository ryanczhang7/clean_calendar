import { assert, assertEquals } from "@std/assert";
import { expand, type Occurrence } from "../../../shared/recurrence.ts";
import {
  dueOccurrences,
  dueReminders,
  fireAt,
  handleSendReminders,
  isDue,
  isServiceRole,
  payloadFor,
  payloadForOccurrence,
  type PushOutcome,
  type PushPayload,
  type ReminderRow,
  type SendDeps,
  SERIES_QUERY,
  type Subscription,
  WINDOW_MS,
} from "./handler.ts";
import type {
  OccurrenceReminder,
  OverrideRow,
  SeriesReminderRow,
  SeriesRow,
} from "./materialise.ts";

// CAL-028 Contract Block 2 (AC-1 to AC-4). Same seam as capture/handler_test:
// every outbound call goes through deps.fetch, answered from a routing table
// keyed by "METHOD url" - the FULL url, query string included, because the
// query string is where the Contract pins the server-side filters (soft-deleted
// reminder, soft-deleted event, recurring template). The url is compared after
// decodeURIComponent, so whether the implementation percent-encodes `,()!:` is
// its own choice; the parameters and their order are not. A url the table does
// not hold is RECORDED as unexpected and then thrown, so a swallowed throw still
// fails the test.
//
// Every value is read out of the Contract, never calibrated: the 5-minute
// window, the status codes and error strings, the query strings, the PATCH body
// and headers, the log line.

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_KEY = "service-key-test-7d1e";
const FN_URL = `${SUPABASE_URL}/functions/v1/send-reminders`;

/** `now` for every scenario: 2026-11-03 09:00:00.000 UTC. */
const NOW = new Date("2026-11-03T09:00:00.000Z");
const MIN = 60_000;

const CANDIDATES = `GET ${SUPABASE_URL}/rest/v1/reminders` +
  "?select=id,minutes_before,sent_at,event:events!inner(id,title,starts_at,all_day,location)" +
  "&deleted_at=is.null&occurrence_date=is.null&event.deleted_at=is.null&event.recurrence=is.null";
/** CAL-029 Block 4 step 1: the series read, verbatim. */
const SERIES_QUERY_TEXT =
  "select=id,title,kind_id,starts_at,ends_at,all_day,location,notes,recurrence," +
  "reminders(id,minutes_before,sent_at,occurrence_date,deleted_at)," +
  "event_overrides(occurrence_date,cancelled,title,kind_id,starts_at,ends_at,all_day,location,notes)" +
  "&deleted_at=is.null&recurrence=not.is.null";
const SERIES = `GET ${SUPABASE_URL}/rest/v1/events?${SERIES_QUERY_TEXT}`;
/** CAL-029 Block 4 step 2: the materialisation POST. */
const MATERIALISE =
  `POST ${SUPABASE_URL}/rest/v1/reminders?on_conflict=event_id,occurrence_date`;
const SUBSCRIPTIONS =
  `GET ${SUPABASE_URL}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth`;
const patchKey = (id: string) =>
  `PATCH ${SUPABASE_URL}/rest/v1/reminders?id=eq.${id}`;
const deleteKey = (id: string) =>
  `DELETE ${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${id}`;

// ---------------------------------------------------------------- JWTs

function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function jwt(claims: unknown): string {
  return [
    b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    b64url(JSON.stringify(claims)),
    "c2lnbmF0dXJlLW5vdC1jaGVja2Vk",
  ].join(".");
}

/**
 * The shape of a real Supabase service-role JWT. The `n` claim is chosen so
 * the middle segment contains a base64url-only character (`_`) and needs
 * padding restored (length % 4 != 0): a decoder that uses plain `atob` on the
 * segment as-is fails here, which is the point.
 */
const SERVICE_CLAIMS = {
  iss: "supabase-demo",
  role: "service_role",
  exp: 1983812996,
  n: "???>",
};
const SERVICE_JWT = jwt(SERVICE_CLAIMS);
const SERVICE_MIDDLE = SERVICE_JWT.split(".")[1]!;

Deno.test("the test's service-role JWT exercises base64url and missing padding", () => {
  assert(
    SERVICE_MIDDLE.includes("_") || SERVICE_MIDDLE.includes("-"),
    `middle segment ${SERVICE_MIDDLE} has no base64url-only character`,
  );
  assert(SERVICE_MIDDLE.length % 4 !== 0, "middle segment needs no padding");
});

function request(
  authorization: string | null = `Bearer ${SERVICE_JWT}`,
  method = "POST",
): Request {
  const headers = new Headers();
  if (authorization !== null) headers.set("authorization", authorization);
  return new Request(FN_URL, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : "{}",
  });
}

// ---------------------------------------------------------------- fixtures

function row(
  id: string,
  startsAt: string,
  minutesBefore: number,
  sentAt: string | null = null,
  event: Partial<ReminderRow["event"]> = {},
): ReminderRow {
  return {
    id,
    minutes_before: minutesBefore,
    sent_at: sentAt,
    event: {
      id: `evt-${id}`,
      title: `Title ${id}`,
      starts_at: startsAt,
      all_day: false,
      location: null,
      ...event,
    },
  };
}

function sub(id: string): Subscription {
  return {
    id,
    endpoint: `https://push.example.test/${id}`,
    p256dh: `p256dh-${id}`,
    auth: `auth-${id}`,
  };
}

// PostgREST returns timestamptz as "+00:00", which is what the rows carry.
/** fire_at 08:54 - due 6 minutes ago: EXCLUDED (the window's lower bound). */
const R_6_AGO = row("r-6-ago", "2026-11-03T09:09:00+00:00", 15);
/** fire_at 09:01 - due in 1 minute: EXCLUDED. */
const R_IN_1 = row("r-in-1", "2026-11-03T09:16:00+00:00", 15);
/** fire_at 08:58, sent at 08:58:05 - already sent for this fire_at: EXCLUDED. */
const R_SENT = row(
  "r-sent",
  "2026-11-03T09:13:00+00:00",
  15,
  "2026-11-03T08:58:05.000+00:00",
);
/**
 * fire_at was 08:48 and it was sent at 08:48:10; the event then moved 10 min
 * later, so fire_at is 08:58 and sent_at < fire_at - 5 min: INCLUDED again.
 */
const R_MOVED = row(
  "r-moved",
  "2026-11-03T09:13:00+00:00",
  15,
  "2026-11-03T08:48:10.000+00:00",
);
/** fire_at 08:56 - due 4 minutes ago: INCLUDED. */
const R_4_AGO = row("r-4-ago", "2026-11-03T09:11:00+00:00", 15);
/** fire_at 09:00 - due exactly now: INCLUDED (upper bound closed). */
const R_NOW = row("r-now", "2026-11-03T09:10:00+00:00", 10);
/** fire_at 08:55 - due exactly 5 minutes ago: INCLUDED (lower bound closed). */
const R_5_AGO = row("r-5-ago", "2026-11-03T09:00:00+00:00", 5);
/** All day, local midnight (London = UTC on this date), -540: fires 09:00. */
const R_ALL_DAY = row("r-all-day", "2026-11-03T00:00:00+00:00", -540, null, {
  all_day: true,
});

/** The whole AC-2 control set, in the order the read returns it. */
const CONTROL_SET = [
  R_6_AGO,
  R_IN_1,
  R_SENT,
  R_MOVED,
  R_4_AGO,
  R_NOW,
  R_5_AGO,
  R_ALL_DAY,
];
const CONTROL_DUE = [R_MOVED, R_4_AGO, R_NOW, R_5_AGO, R_ALL_DAY];

// ---------------------------------------------------------------- the world

type Call = {
  key: string;
  method: string;
  url: string;
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

type WorldOptions = {
  reminders?: ReminderRow[];
  candidates?: Route;
  subscriptions?: Subscription[];
  subscriptionsRoute?: Route;
  /** Outcomes per subscription id, consumed in order; exhausted means "sent". */
  outcomes?: Record<string, PushOutcome[]>;
  deleteRoute?: Route;
  sendPush?: null;
  /** CAL-029: the series read's rows; every run answers it, `[]` by default. */
  series?: SeriesRow[];
  seriesRoute?: Route;
  /** CAL-029: the materialisation POST; 201 with no body by default. */
  materialiseRoute?: Route;
  /** CAL-029: `now` for the run; NOW by default. */
  now?: Date;
};

function world(opts: WorldOptions = {}) {
  const calls: Call[] = [];
  const unexpected: string[] = [];
  const pushes: { sub: Subscription; payload: PushPayload }[] = [];
  const log: string[] = [];
  /** fetches and pushes interleaved, in the order they happened */
  const timeline: string[] = [];
  const env: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  };
  const subs = opts.subscriptions ?? [sub("sub-a")];
  const routes: Record<string, Route> = {
    [CANDIDATES]: opts.candidates ?? (() => json(opts.reminders ?? [])),
    [SUBSCRIPTIONS]: opts.subscriptionsRoute ?? (() => json(subs)),
    [SERIES]: opts.seriesRoute ?? (() => json(opts.series ?? [])),
    [MATERIALISE]: opts.materialiseRoute ??
      (() => new Response(null, { status: 201 })),
  };
  for (const r of opts.reminders ?? []) {
    routes[patchKey(r.id)] = () => new Response(null, { status: 204 });
  }
  for (const s of opts.series ?? []) {
    for (const r of s.reminders) {
      routes[patchKey(r.id)] = () => new Response(null, { status: 204 });
    }
  }
  for (const s of subs) {
    routes[deleteKey(s.id)] = opts.deleteRoute ??
      (() => new Response(null, { status: 204 }));
  }
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = decodeURIComponent(req.url);
    const key = `${req.method} ${url}`;
    const call: Call = {
      key,
      method: req.method,
      url,
      headers: req.headers,
      body: await req.text(),
    };
    calls.push(call);
    timeline.push(key);
    const route = routes[key];
    if (route === undefined) {
      unexpected.push(key);
      throw new Error(`unexpected fetch ${key}`);
    }
    return await route(call);
  }) as typeof globalThis.fetch;
  const queues: Record<string, PushOutcome[]> = {};
  for (const [id, list] of Object.entries(opts.outcomes ?? {})) {
    queues[id] = [...list];
  }
  const sendPush = async (
    s: Subscription,
    payload: PushPayload,
  ): Promise<PushOutcome> => {
    pushes.push({ sub: s, payload });
    timeline.push(`push ${s.id} ${payload.eventId}`);
    await Promise.resolve();
    return queues[s.id]?.shift() ?? { status: "sent" };
  };
  const deps: SendDeps = {
    fetch,
    env: (n: string) => env[n],
    now: () => new Date((opts.now ?? NOW).getTime()),
    sendPush: opts.sendPush === null ? null : sendPush,
    log: (line: string) => {
      log.push(line);
    },
  };
  return {
    deps,
    calls,
    unexpected,
    pushes,
    log,
    timeline,
    keys: () => calls.map((c) => c.key),
    only: (key: string) => {
      const found = calls.filter((c) => c.key === key);
      assertEquals(found.length, 1, `expected exactly one ${key}`);
      return found[0]!;
    },
  };
}

async function run(w: ReturnType<typeof world>, req: Request = request()) {
  const res = await handleSendReminders(req, w.deps);
  assert(
    (res.headers.get("content-type") ?? "").startsWith("application/json"),
    `response ${res.status} has content-type ${
      res.headers.get("content-type")
    }`,
  );
  const body = await res.json();
  assertEquals(w.unexpected, [], "the handler fetched a URL nobody expected");
  return { status: res.status, body };
}

function assertServiceHeaders(call: Call) {
  assertEquals(
    call.headers.get("apikey"),
    SERVICE_KEY,
    `${call.key} without the service key as apikey`,
  );
  assertEquals(
    call.headers.get("authorization"),
    `Bearer ${SERVICE_KEY}`,
    `${call.key} without the service key as bearer`,
  );
}

// ================================================================ AC-1

Deno.test("AC-1: isServiceRole is true only for a bearer JWT whose role claim is exactly service_role", () => {
  assertEquals(isServiceRole(request()), true);
  assertEquals(isServiceRole(request(`bearer ${SERVICE_JWT}`)), true);
  assertEquals(isServiceRole(request(null)), false, "no authorization header");
  assertEquals(
    isServiceRole(request(`Basic ${SERVICE_JWT}`)),
    false,
    "not a bearer scheme",
  );
  assertEquals(
    isServiceRole(request(`Bearer ${jwt({ role: "authenticated" })}`)),
    false,
    "role authenticated",
  );
  assertEquals(
    isServiceRole(request(`Bearer ${jwt({ role: "anon" })}`)),
    false,
    "role anon",
  );
  assertEquals(
    isServiceRole(request(`Bearer ${jwt({ role: "service_role " })}`)),
    false,
    "role with a trailing space is not exactly service_role",
  );
  assertEquals(
    isServiceRole(request(`Bearer ${jwt({ roles: ["service_role"] })}`)),
    false,
    "no role claim",
  );
  assertEquals(
    isServiceRole(request(`Bearer ${jwt(["service_role"])}`)),
    false,
    "payload is an array, not an object",
  );
  assertEquals(
    isServiceRole(request("Bearer aGVhZGVy.!!!not-base64!!!.c2ln")),
    false,
    "middle segment is not base64url",
  );
  assertEquals(
    isServiceRole(request(`Bearer aGVhZGVy.${b64url("not json")}.c2ln`)),
    false,
    "middle segment is not JSON",
  );
  assertEquals(
    isServiceRole(request("Bearer service_role")),
    false,
    "a token with no segments",
  );
});

Deno.test("AC-1: a request with no bearer token is 401 unauthorized and fetches nothing", async () => {
  const w = world({ reminders: [R_NOW] });
  const { status, body } = await run(w, request(null));
  assertEquals(status, 401);
  assertEquals(body, { error: "unauthorized" });
  assertEquals(w.keys(), [], "it read before refusing");
  assertEquals(w.pushes.length, 0);
});

Deno.test("AC-1: a signed-in user's JWT (role authenticated) is 401 and fetches nothing", async () => {
  const w = world({ reminders: [R_NOW] });
  const { status, body } = await run(
    w,
    request(`Bearer ${jwt({ role: "authenticated", sub: "u-1" })}`),
  );
  assertEquals(status, 401);
  assertEquals(body, { error: "unauthorized" });
  assertEquals(w.keys(), []);
  assertEquals(w.pushes.length, 0);
});

Deno.test("AC-1: a malformed token is 401 and fetches nothing", async () => {
  for (
    const auth of [
      "Bearer aGVhZGVy.!!!not-base64!!!.c2ln",
      `Bearer aGVhZGVy.${b64url("{role: service_role}")}.c2ln`,
      "Bearer onlyonesegment",
    ]
  ) {
    const w = world({ reminders: [R_NOW] });
    const { status, body } = await run(w, request(auth));
    assertEquals(status, 401, `${auth} was not refused`);
    assertEquals(body, { error: "unauthorized" });
    assertEquals(w.keys(), [], `${auth} read before refusing`);
  }
});

Deno.test("AC-1: the token is checked before the method - a GET without service role is 401, not 405", async () => {
  const w = world();
  const { status } = await run(
    w,
    request(`Bearer ${jwt({ role: "authenticated" })}`, "GET"),
  );
  assertEquals(status, 401);
  assertEquals(w.keys(), []);
});

Deno.test("step 2: a service-role GET is 405 method and fetches nothing", async () => {
  const w = world({ reminders: [R_NOW] });
  const { status, body } = await run(w, request(undefined, "GET"));
  assertEquals(status, 405);
  assertEquals(body, { error: "method" });
  assertEquals(w.keys(), []);
});

Deno.test("step 3: with no VAPID sender the function is 503 and reads nothing, so nothing is marked sent", async () => {
  const w = world({ reminders: [R_NOW], sendPush: null });
  const { status, body } = await run(w);
  assertEquals(status, 503);
  assertEquals(body, { error: "vapid not configured" });
  assertEquals(
    w.keys(),
    [],
    "it read or marked a reminder while misconfigured",
  );
});

Deno.test("step 3: the method is checked before the VAPID sender - a GET with no sender is 405", async () => {
  const w = world({ sendPush: null });
  const { status } = await run(w, request(undefined, "GET"));
  assertEquals(status, 405);
  assertEquals(w.keys(), []);
});

// ================================================================ AC-2

Deno.test("AC-2: WINDOW_MS is five minutes", () => {
  assertEquals(WINDOW_MS, 5 * 60_000);
});

Deno.test("AC-2: fireAt is starts_at minus minutes_before; a negative minutes_before fires after the start", () => {
  assertEquals(
    fireAt("2026-11-03T09:15:00+00:00", 15).toISOString(),
    "2026-11-03T09:00:00.000Z",
  );
  assertEquals(
    fireAt("2026-11-03T09:15:00+00:00", 0).toISOString(),
    "2026-11-03T09:15:00.000Z",
  );
  assertEquals(
    fireAt("2026-11-03T00:00:00+00:00", -540).toISOString(),
    "2026-11-03T09:00:00.000Z",
    "an all-day reminder at -540 fires at 09:00 on the day",
  );
  assertEquals(
    fireAt("2026-11-03T10:00:00+01:00", 1440).toISOString(),
    "2026-11-02T09:00:00.000Z",
    "an offset is honoured and a day before crosses the date",
  );
});

Deno.test("AC-2: isDue is the closed window [now - 5 min, now], re-armed only when sent_at < fire_at - 5 min", () => {
  const at = (ms: number) => new Date(NOW.getTime() + ms);
  const iso = (ms: number) => at(ms).toISOString();
  // never sent
  assertEquals(isDue(at(0), null, NOW), true, "due exactly now");
  assertEquals(isDue(at(-4 * MIN), null, NOW), true, "due 4 minutes ago");
  assertEquals(isDue(at(-5 * MIN), null, NOW), true, "due exactly 5 min ago");
  assertEquals(isDue(at(-5 * MIN - 1), null, NOW), false, "5 min + 1 ms ago");
  assertEquals(isDue(at(-6 * MIN), null, NOW), false, "due 6 minutes ago");
  assertEquals(isDue(at(1), null, NOW), false, "due in 1 ms");
  assertEquals(isDue(at(MIN), null, NOW), false, "due in 1 minute");
  // sent
  const fire = -2 * MIN;
  assertEquals(
    isDue(at(fire), iso(fire + 5_000), NOW),
    false,
    "sent just after this fire_at",
  );
  assertEquals(
    isDue(at(fire), iso(fire - 5 * MIN), NOW),
    false,
    "sent exactly fire_at - 5 min is not strictly before it",
  );
  assertEquals(
    isDue(at(fire), iso(fire - 5 * MIN - 1), NOW),
    true,
    "sent 1 ms before fire_at - 5 min is re-armed",
  );
  assertEquals(
    isDue(at(fire), iso(fire - 10 * MIN), NOW),
    true,
    "sent before the event moved 10 min later",
  );
  assertEquals(
    isDue(at(-6 * MIN), iso(-30 * MIN), NOW),
    false,
    "re-armed but outside the window",
  );
});

Deno.test("AC-2: dueReminders keeps exactly the due rows of the control set, in order", () => {
  assertEquals(
    dueReminders(CONTROL_SET, NOW).map((r: ReminderRow) => r.id),
    CONTROL_DUE.map((r) => r.id),
  );
  assertEquals(dueReminders([], NOW), []);
});

Deno.test("AC-2: the candidates are one read whose query filters out soft-deleted reminders, soft-deleted events, occurrences and recurring templates", async () => {
  const w = world({ reminders: [] });
  await run(w);
  const call = w.only(CANDIDATES);
  assertServiceHeaders(call);
  assertEquals(
    call.url,
    `${SUPABASE_URL}/rest/v1/reminders` +
      "?select=id,minutes_before,sent_at,event:events!inner(id,title,starts_at,all_day,location)" +
      "&deleted_at=is.null&occurrence_date=is.null&event.deleted_at=is.null&event.recurrence=is.null",
  );
});

Deno.test("AC-2: in the control set only the due reminders are pushed and marked; 6 min ago, in 1 min and already-sent are not", async () => {
  const w = world({ reminders: CONTROL_SET, subscriptions: [sub("sub-a")] });
  const { status, body } = await run(w);
  assertEquals(status, 200);
  assertEquals(body, {
    due: 5,
    sent: 5,
    pruned: 0,
    failed: 0,
    materialised: 0,
  });
  assertEquals(
    w.pushes.map((p) => p.payload.eventId),
    CONTROL_DUE.map((r) => r.event.id),
  );
  const patched = w.calls.filter((c) => c.method === "PATCH").map((c) => c.key);
  assertEquals(patched, CONTROL_DUE.map((r) => patchKey(r.id)));
  for (const excluded of [R_6_AGO, R_IN_1, R_SENT]) {
    assert(
      !w.pushes.some((p) => p.payload.eventId === excluded.event.id),
      `${excluded.id} was pushed`,
    );
    assert(!patched.includes(patchKey(excluded.id)), `${excluded.id} marked`);
  }
});

Deno.test("step 5: no due reminder is 200 with zero counts and no read after the series read - no subscriptions read", async () => {
  const w = world({ reminders: [R_6_AGO, R_IN_1, R_SENT] });
  const { status, body } = await run(w);
  assertEquals(status, 200);
  assertEquals(body, {
    due: 0,
    sent: 0,
    pruned: 0,
    failed: 0,
    materialised: 0,
  });
  assertEquals(w.keys(), [CANDIDATES, SERIES]);
  assertEquals(w.pushes.length, 0);
});

Deno.test("step 4: a failing candidates read is 502 upstream and the series is not read and nothing is pushed or marked", async () => {
  const cases: [string, Route][] = [
    ["a 500", () => json({ message: "boom" }, 500)],
    ["a 401", () => json({ message: "JWT expired" }, 401)],
    ["a throw", () => {
      throw new TypeError("connection refused");
    }],
    ["an object body", () => json({ rows: [] })],
    ["a non-JSON body", () => new Response("<html>", { status: 200 })],
  ];
  for (const [label, candidates] of cases) {
    const w = world({ reminders: [R_NOW], candidates });
    const res = await handleSendReminders(request(), w.deps);
    assertEquals(res.status, 502, `${label} was not a 502`);
    assertEquals(await res.json(), { error: "upstream" }, label);
    assertEquals(w.keys(), [CANDIDATES], `${label}: read or marked further`);
    assertEquals(w.pushes.length, 0, label);
  }
});

Deno.test("step 6: a failing subscriptions read is 502 upstream and the due reminder is not marked", async () => {
  const cases: [string, Route][] = [
    ["a 500", () => json({ message: "boom" }, 500)],
    ["a throw", () => {
      throw new TypeError("connection refused");
    }],
    ["an object body", () => json({ id: "sub-a" })],
  ];
  for (const [label, subscriptionsRoute] of cases) {
    const w = world({ reminders: [R_NOW], subscriptionsRoute });
    const res = await handleSendReminders(request(), w.deps);
    assertEquals(res.status, 502, `${label} was not a 502`);
    assertEquals(await res.json(), { error: "upstream" }, label);
    assertEquals(w.keys(), [CANDIDATES, SERIES, SUBSCRIPTIONS], label);
    assertEquals(w.pushes.length, 0, label);
  }
});

// ================================================================ AC-3

Deno.test("AC-3: payloadFor is the five fields, startsAt as stored, an empty location as null", () => {
  const base = row("r-1", "2026-11-03T09:15:00+00:00", 15, null, {
    id: "evt-1",
    title: "Dentist",
    location: "12 High Street",
  });
  assertEquals(payloadFor(base), {
    eventId: "evt-1",
    title: "Dentist",
    startsAt: "2026-11-03T09:15:00+00:00",
    allDay: false,
    location: "12 High Street",
  });
  assertEquals(
    payloadFor({ ...base, event: { ...base.event, location: "" } }),
    {
      eventId: "evt-1",
      title: "Dentist",
      startsAt: "2026-11-03T09:15:00+00:00",
      allDay: false,
      location: null,
    },
  );
  assertEquals(
    payloadFor({ ...base, event: { ...base.event, location: null } }).location,
    null,
  );
  assertEquals(
    payloadFor({ ...base, event: { ...base.event, all_day: true } }).allDay,
    true,
  );
});

Deno.test("AC-3: one due reminder, two subscriptions - two pushes in order with the same payload, then ONE PATCH of sent_at", async () => {
  const r = row("r-1", "2026-11-03T09:10:00+00:00", 10, null, {
    id: "evt-1",
    title: "Dentist",
    location: "",
  });
  const subs = [sub("sub-a"), sub("sub-b")];
  const w = world({ reminders: [r], subscriptions: subs });
  const { status, body } = await run(w);
  assertEquals(status, 200);
  assertEquals(body, {
    due: 1,
    sent: 2,
    pruned: 0,
    failed: 0,
    materialised: 0,
  });
  const expected: PushPayload = {
    eventId: "evt-1",
    title: "Dentist",
    startsAt: "2026-11-03T09:10:00+00:00",
    allDay: false,
    location: null,
  };
  assertEquals(w.pushes, [
    { sub: subs[0]!, payload: expected },
    { sub: subs[1]!, payload: expected },
  ]);
  assertEquals(w.timeline, [
    CANDIDATES,
    SERIES,
    SUBSCRIPTIONS,
    "push sub-a evt-1",
    "push sub-b evt-1",
    patchKey("r-1"),
  ]);
  const patch = w.only(patchKey("r-1"));
  assertServiceHeaders(patch);
  assertServiceHeaders(w.only(SUBSCRIPTIONS));
  assertEquals(patch.headers.get("prefer"), "return=minimal");
  assertEquals(patch.headers.get("content-type"), "application/json");
  assertEquals(JSON.parse(patch.body), { sent_at: NOW.toISOString() });
});

Deno.test("AC-3: with zero subscriptions nothing is pushed and the reminder is still marked sent", async () => {
  const w = world({ reminders: [R_NOW], subscriptions: [] });
  const { status, body } = await run(w);
  assertEquals(status, 200);
  assertEquals(body, {
    due: 1,
    sent: 0,
    pruned: 0,
    failed: 0,
    materialised: 0,
  });
  assertEquals(w.pushes.length, 0);
  assertEquals(w.keys(), [
    CANDIDATES,
    SERIES,
    SUBSCRIPTIONS,
    patchKey(R_NOW.id),
  ]);
  assertEquals(JSON.parse(w.only(patchKey(R_NOW.id)).body), {
    sent_at: NOW.toISOString(),
  });
});

Deno.test("AC-3: two due reminders are sent in response order, each marked before the next one's pushes", async () => {
  const w = world({
    reminders: [R_4_AGO, R_NOW],
    subscriptions: [sub("sub-a"), sub("sub-b")],
  });
  const { body } = await run(w);
  assertEquals(body, {
    due: 2,
    sent: 4,
    pruned: 0,
    failed: 0,
    materialised: 0,
  });
  assertEquals(w.timeline, [
    CANDIDATES,
    SERIES,
    SUBSCRIPTIONS,
    `push sub-a ${R_4_AGO.event.id}`,
    `push sub-b ${R_4_AGO.event.id}`,
    patchKey(R_4_AGO.id),
    `push sub-a ${R_NOW.event.id}`,
    `push sub-b ${R_NOW.event.id}`,
    patchKey(R_NOW.id),
  ]);
});

// ================================================================ AC-4

for (const code of [410, 404] as const) {
  Deno.test(`AC-4: a push answered ${code} deletes that subscription once, is not pushed again this run, and the reminders are still marked`, async () => {
    const w = world({
      reminders: [R_4_AGO, R_NOW],
      subscriptions: [sub("sub-a"), sub("sub-b")],
      // answers gone on EVERY attempt: a second attempt would be a second gone
      outcomes: {
        "sub-a": [
          { status: "gone", code },
          { status: "gone", code },
        ],
      },
    });
    const { status, body } = await run(w);
    assertEquals(status, 200);
    assertEquals(body, {
      due: 2,
      sent: 2,
      pruned: 1,
      failed: 0,
      materialised: 0,
    });
    assertEquals(
      w.pushes.filter((p) => p.sub.id === "sub-a").length,
      1,
      "the gone subscription was pushed again in the same run",
    );
    assertEquals(
      w.pushes.filter((p) => p.sub.id === "sub-b").map((p) =>
        p.payload.eventId
      ),
      [R_4_AGO.event.id, R_NOW.event.id],
    );
    const deletes = w.calls.filter((c) => c.method === "DELETE");
    assertEquals(deletes.map((c) => c.key), [deleteKey("sub-a")]);
    assertServiceHeaders(deletes[0]!);
    assertEquals(
      w.calls.filter((c) => c.method === "PATCH").map((c) => c.key),
      [patchKey(R_4_AGO.id), patchKey(R_NOW.id)],
    );
    assert(
      w.timeline.indexOf(deleteKey("sub-a")) > w.timeline.indexOf(
        `push sub-a ${R_4_AGO.event.id}`,
      ),
      "deleted before it was answered gone",
    );
  });
}

Deno.test("AC-4: any other failure keeps the subscription, logs its id, code and message, and it is pushed for the next reminder", async () => {
  const w = world({
    reminders: [R_4_AGO, R_NOW],
    subscriptions: [sub("sub-a"), sub("sub-b")],
    outcomes: {
      "sub-a": [{ status: "failed", code: 500, message: "Internal Error" }],
    },
  });
  const { status, body } = await run(w);
  assertEquals(status, 200);
  assertEquals(body, {
    due: 2,
    sent: 3,
    pruned: 0,
    failed: 1,
    materialised: 0,
  });
  assertEquals(w.calls.filter((c) => c.method === "DELETE"), []);
  assertEquals(
    w.pushes.filter((p) => p.sub.id === "sub-a").map((p) => p.payload.eventId),
    [R_4_AGO.event.id, R_NOW.event.id],
  );
  assertEquals(
    w.log.filter((l) => l.includes("sub-a")),
    ["send-reminders: push to sub-a failed: 500 Internal Error"],
  );
  assertEquals(
    w.calls.filter((c) => c.method === "PATCH").map((c) => c.key),
    [patchKey(R_4_AGO.id), patchKey(R_NOW.id)],
  );
});

Deno.test("AC-4: counts over a mixed run - sent, failed, and pruned counting distinct subscriptions", async () => {
  const w = world({
    reminders: [R_4_AGO, R_NOW],
    subscriptions: [sub("sub-a"), sub("sub-b"), sub("sub-c")],
    outcomes: {
      "sub-a": [{ status: "gone", code: 410 }],
      "sub-b": [{ status: "failed", code: null, message: "network down" }],
      "sub-c": [{ status: "sent" }, { status: "gone", code: 404 }],
    },
  });
  const { body } = await run(w);
  // r1: a gone, b failed, c sent; r2: b sent, c gone
  assertEquals(body, {
    due: 2,
    sent: 2,
    pruned: 2,
    failed: 1,
    materialised: 0,
  });
  assertEquals(
    w.calls.filter((c) => c.method === "DELETE").map((c) => c.key),
    [deleteKey("sub-a"), deleteKey("sub-c")],
  );
});

Deno.test("AC-4: a DELETE that fails is logged and changes neither the response nor the marking", async () => {
  const cases: [string, Route][] = [
    ["a 500", () => json({ message: "boom" }, 500)],
    ["a throw", () => {
      throw new TypeError("connection reset");
    }],
  ];
  for (const [label, deleteRoute] of cases) {
    const w = world({
      reminders: [R_NOW],
      subscriptions: [sub("sub-a"), sub("sub-b")],
      outcomes: { "sub-a": [{ status: "gone", code: 410 }] },
      deleteRoute,
    });
    const res = await handleSendReminders(request(), w.deps);
    assertEquals(res.status, 200, label);
    assertEquals(
      await res.json(),
      { due: 1, sent: 1, pruned: 1, failed: 0, materialised: 0 },
      `${label}: the response differs from a successful delete`,
    );
    assertEquals(
      w.calls.filter((c) => c.method === "DELETE").length,
      1,
      label,
    );
    assertEquals(w.only(patchKey(R_NOW.id)).method, "PATCH", label);
    assert(
      w.log.some((l) => l.includes("sub-a")),
      `${label}: the failed delete was not logged with the subscription id`,
    );
  }
});

// ================================================================ CAL-029
//
// CAL-029 Contract Blocks 3 and 4: the run reads the series after the
// candidates, plans with materialise.ts, POSTs what is missing, then fires the
// plain rows followed by the due materialised rows. Every instant is read out
// of Blocks 5 and 6 or derived from the fixture by hand in a comment; every
// zone is the series' recurrence.tz.

function tmpl(
  id: string,
  minutesBefore: number,
  deletedAt: string | null = null,
): SeriesReminderRow {
  return {
    id,
    minutes_before: minutesBefore,
    sent_at: null,
    occurrence_date: null,
    deleted_at: deletedAt,
  };
}

function mat(
  id: string,
  occurrenceDate: string,
  minutesBefore: number,
  sentAt: string | null = null,
  deletedAt: string | null = null,
): SeriesReminderRow {
  return {
    id,
    minutes_before: minutesBefore,
    sent_at: sentAt,
    occurrence_date: occurrenceDate,
    deleted_at: deletedAt,
  };
}

function ovr(
  occurrenceDate: string,
  fields: Partial<OverrideRow> = {},
): OverrideRow {
  return {
    occurrence_date: occurrenceDate,
    cancelled: false,
    title: null,
    kind_id: null,
    starts_at: null,
    ends_at: null,
    all_day: null,
    location: null,
    notes: null,
    ...fields,
  };
}

function seriesRow(
  fields: Partial<SeriesRow> & Pick<SeriesRow, "id" | "starts_at" | "ends_at">,
): SeriesRow {
  return {
    title: `Title ${fields.id}`,
    kind_id: "kind-1",
    all_day: false,
    location: null,
    notes: null,
    recurrence: { freq: "daily", until: null, tz: "UTC" },
    reminders: [],
    event_overrides: [],
    ...fields,
  };
}

function occurrence(fields: Partial<Occurrence> = {}): Occurrence {
  return {
    seriesId: "s-1",
    occurrenceDate: "2026-11-03",
    title: "Gym",
    kindId: "kind-1",
    startsAt: new Date("2026-11-03T09:10:00.000Z"),
    endsAt: new Date("2026-11-03T10:00:00.000Z"),
    allDay: false,
    location: null,
    notes: null,
    ...fields,
  };
}

function candidate(
  id: string,
  minutesBefore: number,
  sentAt: string | null,
  occ: Occurrence,
): OccurrenceReminder {
  return {
    id,
    minutes_before: minutesBefore,
    sent_at: sentAt,
    occurrence: occ,
  };
}

/**
 * Daily 10:00-11:00Z from Monday 2 November, template 30. At NOW (Tue 09:00Z)
 * the range is [Tue 08:55Z, Thu 09:00Z): Monday's has ended, Tuesday's and
 * Wednesday's are in it, Thursday's starts after the end. Two inserts, none due.
 */
const S_INSERTS = seriesRow({
  id: "s-inserts",
  starts_at: "2026-11-02T10:00:00+00:00",
  ends_at: "2026-11-02T11:00:00+00:00",
  reminders: [tmpl("t-inserts", 30)],
});
const S_INSERTS_BODY = [
  { event_id: "s-inserts", occurrence_date: "2026-11-03", minutes_before: 30 },
  { event_id: "s-inserts", occurrence_date: "2026-11-04", minutes_before: 30 },
];

/**
 * Daily "Gym" 09:10-10:00Z from Monday 2 November, template 30, with Tuesday
 * and Wednesday materialised at 10 minutes. At NOW the occurrences in range
 * are Tuesday's and Wednesday's, both with a row, so nothing is inserted;
 * Tuesday's row fires 09:00 (due now), Wednesday's tomorrow. With the
 * TEMPLATE's 30 minutes Tuesday's would have fired 08:40 - outside the window.
 */
const S_DUE = seriesRow({
  id: "s-due",
  title: "Gym",
  starts_at: "2026-11-02T09:10:00+00:00",
  ends_at: "2026-11-02T10:00:00+00:00",
  location: "Leisure centre",
  reminders: [
    tmpl("t-due", 30),
    mat("m-tue", "2026-11-03", 10),
    mat("m-wed", "2026-11-04", 10),
  ],
});

/** Block 5: weekly 09:00 London from Monday 19 October 2026 (BST). */
const S_LONDON = seriesRow({
  id: "s-london",
  starts_at: "2026-10-19T08:00:00+00:00",
  ends_at: "2026-10-19T09:00:00+00:00",
  recurrence: { freq: "weekly", until: null, tz: "Europe/London" },
  reminders: [tmpl("t-london", 30)],
});

/** What `expand` throws for an unknown zone, read from the expander itself. */
function unknownZoneMessage(tz: string): string {
  try {
    expand(
      {
        id: "probe",
        title: "probe",
        kindId: "k",
        startsAt: new Date("2026-11-02T10:00:00Z"),
        endsAt: new Date("2026-11-02T11:00:00Z"),
        allDay: false,
        location: null,
        notes: null,
        recurrence: { freq: "daily", until: null, tz },
      },
      [],
      { start: NOW, end: new Date(NOW.getTime() + 60 * MIN) },
    );
  } catch (err) {
    return String((err as Error).message);
  }
  throw new Error(`expand accepted the zone ${tz}`);
}

const posts = (w: ReturnType<typeof world>) =>
  w.calls.filter((c) => c.method === "POST");
const patches = (w: ReturnType<typeof world>) =>
  w.calls.filter((c) => c.method === "PATCH").map((c) => c.key);

// ---------------------------------------------------------------- the series read

Deno.test("CAL-029 Block 4: SERIES_QUERY is the series read's query string, verbatim", () => {
  assertEquals(SERIES_QUERY, SERIES_QUERY_TEXT);
});

Deno.test("CAL-029 AC-5: the series read is one GET whose query drops soft-deleted series (deleted_at=is.null) and non-recurring events", async () => {
  const w = world({});
  await run(w);
  const call = w.only(SERIES);
  assertServiceHeaders(call);
  assertEquals(
    call.url,
    `${SUPABASE_URL}/rest/v1/events` +
      "?select=id,title,kind_id,starts_at,ends_at,all_day,location,notes,recurrence," +
      "reminders(id,minutes_before,sent_at,occurrence_date,deleted_at)," +
      "event_overrides(occurrence_date,cancelled,title,kind_id,starts_at,ends_at,all_day,location,notes)" +
      "&deleted_at=is.null&recurrence=not.is.null",
  );
  assertEquals(
    w.keys(),
    [CANDIDATES, SERIES],
    "the series read is step 5, after the candidates",
  );
});

Deno.test("CAL-029 step 5: a failing series read is 502 upstream before anything is written or pushed", async () => {
  const cases: [string, Route][] = [
    ["a 500", () => json({ message: "boom" }, 500)],
    ["a 401", () => json({ message: "JWT expired" }, 401)],
    ["a throw", () => {
      throw new TypeError("connection refused");
    }],
    ["an object body", () => json({ rows: [] })],
    ["a non-JSON body", () => new Response("<html>", { status: 200 })],
  ];
  for (const [label, seriesRoute] of cases) {
    // a due plain row AND a series with inserts: both must wait for the read
    const w = world({ reminders: [R_NOW], series: [S_INSERTS], seriesRoute });
    const res = await handleSendReminders(request(), w.deps);
    assertEquals(res.status, 502, `${label} was not a 502`);
    assertEquals(await res.json(), { error: "upstream" }, label);
    assertEquals(
      w.keys(),
      [CANDIDATES, SERIES],
      `${label}: wrote or read further`,
    );
    assertEquals(w.pushes.length, 0, `${label}: pushed`);
  }
});

// ---------------------------------------------------------------- AC-1: the POST

Deno.test("CAL-029 AC-1: the missing rows go in ONE POST with on_conflict, ignore-duplicates and the plan as a JSON array", async () => {
  const w = world({ series: [S_INSERTS] });
  const { status, body } = await run(w);
  assertEquals(status, 200);
  assertEquals(body, {
    due: 0,
    sent: 0,
    pruned: 0,
    failed: 0,
    materialised: 2,
  });
  assertEquals(
    w.keys(),
    [CANDIDATES, SERIES, MATERIALISE],
    "nothing due: no subscriptions read after the POST",
  );
  const post = w.only(MATERIALISE);
  assertServiceHeaders(post);
  assertEquals(
    post.headers.get("prefer"),
    "resolution=ignore-duplicates,return=minimal",
  );
  assertEquals(post.headers.get("content-type"), "application/json");
  assertEquals(JSON.parse(post.body), S_INSERTS_BODY);
});

Deno.test("CAL-029 AC-1 (Block 6): run at Monday 08:00Z, a weekly 08:30 UTC series materialises one row, Monday's, at the template's 30 minutes", async () => {
  const weekly = seriesRow({
    id: "s-weekly",
    starts_at: "2026-11-02T08:30:00+00:00",
    ends_at: "2026-11-02T09:30:00+00:00",
    recurrence: { freq: "weekly", until: null, tz: "UTC" },
    reminders: [tmpl("t-weekly", 30)],
  });
  const w = world({
    series: [weekly],
    now: new Date("2026-11-02T08:00:00.000Z"),
  });
  const { body } = await run(w);
  assertEquals(body, {
    due: 0,
    sent: 0,
    pruned: 0,
    failed: 0,
    materialised: 1,
  });
  assertEquals(JSON.parse(w.only(MATERIALISE).body), [
    { event_id: "s-weekly", occurrence_date: "2026-11-02", minutes_before: 30 },
  ]);
});

Deno.test("CAL-029 AC-1: a second run, every occurrence already holding a row (one soft-deleted, one sent), makes no POST at all", async () => {
  const again: SeriesRow = {
    ...S_INSERTS,
    reminders: [
      tmpl("t-inserts", 30),
      mat("m-tue", "2026-11-03", 30, null, "2026-11-02T20:00:00+00:00"),
      mat("m-wed", "2026-11-04", 30, "2026-11-02T08:00:00+00:00"),
    ],
  };
  const w = world({ series: [again] });
  const { status, body } = await run(w);
  assertEquals(status, 200);
  assertEquals(body, {
    due: 0,
    sent: 0,
    pruned: 0,
    failed: 0,
    materialised: 0,
  });
  assertEquals(
    posts(w).map((c) => c.key),
    [],
    "a POST was made with nothing missing",
  );
  assertEquals(w.keys(), [CANDIDATES, SERIES]);
});

Deno.test("CAL-029 AC-1 step 7: a failed POST is logged with the row count and the run still fires what exists", async () => {
  const cases: [string, Route, string][] = [
    ["a 500", () => json({ message: "boom" }, 500), "500"],
    ["a 409", () => json({ message: "conflict" }, 409), "409"],
    ["a throw", () => {
      throw new TypeError("connection refused");
    }, "connection refused"],
  ];
  for (const [label, materialiseRoute, reason] of cases) {
    const w = world({
      reminders: [R_NOW],
      series: [S_INSERTS],
      materialiseRoute,
    });
    const { status, body } = await run(w);
    assertEquals(status, 200, label);
    assertEquals(
      body,
      { due: 1, sent: 1, pruned: 0, failed: 0, materialised: 2 },
      `${label}: materialised is the rows the POST carried`,
    );
    assertEquals(
      w.log,
      [`send-reminders: materialising 2 reminders failed: ${reason}`],
      label,
    );
    assertEquals(
      w.pushes.map((p) => p.payload.eventId),
      [R_NOW.event.id],
      label,
    );
    assertEquals(patches(w), [patchKey(R_NOW.id)], label);
  }
});

// ---------------------------------------------------------------- step 6: skipped

Deno.test("CAL-029 step 6: a malformed recurrence and an unknown zone each log one skipped line, and the next series is still materialised", async () => {
  const bad = seriesRow({
    id: "s-bad",
    starts_at: "2026-11-02T10:00:00+00:00",
    ends_at: "2026-11-02T11:00:00+00:00",
    recurrence: { freq: "monthly", until: null, tz: "UTC" },
    reminders: [tmpl("t-bad", 30)],
  });
  const mars = seriesRow({
    id: "s-mars",
    starts_at: "2026-11-02T10:00:00+00:00",
    ends_at: "2026-11-02T11:00:00+00:00",
    recurrence: { freq: "daily", until: null, tz: "Mars/Olympus" },
    reminders: [tmpl("t-mars", 30)],
  });
  const message = unknownZoneMessage("Mars/Olympus");
  assert(
    message.includes("Mars/Olympus"),
    `the expander's message: ${message}`,
  );
  const w = world({ series: [bad, mars, S_INSERTS] });
  const { status, body } = await run(w);
  assertEquals(status, 200);
  assertEquals(w.log, [
    "send-reminders: series s-bad skipped: recurrence",
    `send-reminders: series s-mars skipped: ${message}`,
  ]);
  assertEquals(JSON.parse(w.only(MATERIALISE).body), S_INSERTS_BODY);
  assertEquals(body, {
    due: 0,
    sent: 0,
    pruned: 0,
    failed: 0,
    materialised: 2,
  });
});

// ---------------------------------------------------------------- AC-3: firing

Deno.test("CAL-029 AC-3: payloadForOccurrence is the series id and the occurrence's fields, startsAt as toISOString, an empty location as null", () => {
  const o = occurrence({
    seriesId: "s-1",
    title: "Gym (late)",
    startsAt: new Date("2026-11-03T10:00:00Z"),
    location: "Pool",
  });
  assertEquals(payloadForOccurrence(candidate("m-1", 30, null, o)), {
    eventId: "s-1",
    title: "Gym (late)",
    startsAt: "2026-11-03T10:00:00.000Z",
    allDay: false,
    location: "Pool",
  });
  assertEquals(
    payloadForOccurrence(candidate("m-1", 30, null, { ...o, location: "" }))
      .location,
    null,
  );
  assertEquals(
    payloadForOccurrence(candidate("m-1", 30, null, { ...o, location: null }))
      .location,
    null,
  );
  assertEquals(
    payloadForOccurrence(candidate("m-1", 30, null, { ...o, allDay: true }))
      .allDay,
    true,
  );
});

Deno.test("CAL-029 AC-3: a due materialised row pushes the occurrence's start and the series id, then PATCHes its own row", async () => {
  const subs = [sub("sub-a"), sub("sub-b")];
  const w = world({ series: [S_DUE], subscriptions: subs });
  const { status, body } = await run(w);
  assertEquals(status, 200);
  assertEquals(body, {
    due: 1,
    sent: 2,
    pruned: 0,
    failed: 0,
    materialised: 0,
  });
  const expected: PushPayload = {
    eventId: "s-due",
    title: "Gym",
    startsAt: "2026-11-03T09:10:00.000Z",
    allDay: false,
    location: "Leisure centre",
  };
  assertEquals(w.pushes, [
    { sub: subs[0]!, payload: expected },
    { sub: subs[1]!, payload: expected },
  ]);
  assertEquals(w.timeline, [
    CANDIDATES,
    SERIES,
    SUBSCRIPTIONS,
    "push sub-a s-due",
    "push sub-b s-due",
    patchKey("m-tue"),
  ]);
  const patch = w.only(patchKey("m-tue"));
  assertServiceHeaders(patch);
  assertEquals(patch.headers.get("prefer"), "return=minimal");
  assertEquals(JSON.parse(patch.body), { sent_at: NOW.toISOString() });
});

Deno.test("CAL-029 step 8: plain rows fire first in response order, then the materialised rows", async () => {
  const w = world({
    reminders: [R_4_AGO, R_NOW],
    series: [S_DUE],
    subscriptions: [sub("sub-a")],
  });
  const { body } = await run(w);
  assertEquals(body, {
    due: 3,
    sent: 3,
    pruned: 0,
    failed: 0,
    materialised: 0,
  });
  assertEquals(w.pushes.map((p) => p.payload.eventId), [
    R_4_AGO.event.id,
    R_NOW.event.id,
    "s-due",
  ]);
  assertEquals(patches(w), [
    patchKey(R_4_AGO.id),
    patchKey(R_NOW.id),
    patchKey("m-tue"),
  ]);
});

// ---------------------------------------------------------------- dueOccurrences

Deno.test("CAL-029: dueOccurrences fires at the occurrence start minus the ROW's minutes_before, in the closed window, in order", () => {
  // NOW 09:00. Starts 09:10: 10 min fires 09:00 (due), 30 min fires 08:40 (not).
  const at0910 = occurrence({ startsAt: new Date("2026-11-03T09:10:00Z") });
  const c10 = candidate("c-10", 10, null, at0910);
  const c30 = candidate("c-30", 30, null, at0910);
  const c14 = candidate("c-14", 14, null, at0910); // 08:56, due
  const c15 = candidate("c-15", 15, null, at0910); // 08:55, due (closed)
  const c16 = candidate("c-16", 16, null, at0910); // 08:54, not
  const c9 = candidate("c-9", 9, null, at0910); // 09:01, not
  assertEquals(
    dueOccurrences([c30, c10, c16, c15, c9, c14], NOW).map((
      c: OccurrenceReminder,
    ) => c.id),
    ["c-10", "c-15", "c-14"],
  );
  assertEquals(dueOccurrences([], NOW), []);
});

Deno.test("CAL-029: dueOccurrences re-arms only when sent_at is before fire_at - 5 min, as isDue", () => {
  const at0910 = occurrence({ startsAt: new Date("2026-11-03T09:10:00Z") });
  const sentJustAfter = candidate(
    "c-a",
    10,
    "2026-11-03T09:00:00.000Z",
    at0910,
  );
  const sentBeforeMove = candidate(
    "c-b",
    10,
    "2026-11-03T08:50:00.000Z",
    at0910,
  );
  assertEquals(
    dueOccurrences([sentJustAfter, sentBeforeMove], NOW).map((
      c: OccurrenceReminder,
    ) => c.id),
    ["c-b"],
  );
});

// ---------------------------------------------------------------- AC-2 at the handler

Deno.test("CAL-029 AC-2: an occurrence moved to 10:00 fires at 09:30, not at the series' 08:30", async () => {
  const moved = seriesRow({
    id: "s-moved",
    title: "Gym",
    starts_at: "2026-11-02T09:00:00+00:00",
    ends_at: "2026-11-02T10:00:00+00:00",
    recurrence: { freq: "weekly", until: null, tz: "UTC" },
    reminders: [tmpl("t-moved", 30), mat("m-mon", "2026-11-02", 30)],
    event_overrides: [ovr("2026-11-02", {
      starts_at: "2026-11-02T10:00:00+00:00",
      ends_at: "2026-11-02T11:00:00+00:00",
    })],
  });
  const early = world({
    series: [moved],
    now: new Date("2026-11-02T08:30:00.000Z"),
  });
  const r1 = await run(early);
  assertEquals(
    r1.body,
    { due: 0, sent: 0, pruned: 0, failed: 0, materialised: 0 },
    "fired at the unmoved 08:30",
  );
  assertEquals(early.pushes.length, 0);

  const late = world({
    series: [moved],
    now: new Date("2026-11-02T09:30:00.000Z"),
  });
  const r2 = await run(late);
  assertEquals(r2.body, {
    due: 1,
    sent: 1,
    pruned: 0,
    failed: 0,
    materialised: 0,
  });
  assertEquals(late.pushes.map((p) => p.payload), [{
    eventId: "s-moved",
    title: "Gym",
    startsAt: "2026-11-02T10:00:00.000Z",
    allDay: false,
    location: null,
  }]);
  assertEquals(patches(late), [patchKey("m-mon")]);
});

Deno.test("CAL-029 AC-2: a cancelled occurrence's materialised row does not fire", async () => {
  const cancelled: SeriesRow = {
    ...S_DUE,
    event_overrides: [ovr("2026-11-03", { cancelled: true })],
  };
  const w = world({ series: [cancelled] });
  const { body } = await run(w);
  assertEquals(body, {
    due: 0,
    sent: 0,
    pruned: 0,
    failed: 0,
    materialised: 0,
  });
  assertEquals(w.pushes.length, 0);
  assertEquals(posts(w).length, 0, "the cancelled occurrence was materialised");
  assertEquals(w.keys(), [CANDIDATES, SERIES]);
});

// ---------------------------------------------------------------- AC-4 at the handler

Deno.test("CAL-029 AC-4: run Saturday 24 October 10:00Z, the 09:00 London series materialises Monday 26 October at 30 minutes", async () => {
  const w = world({
    series: [S_LONDON],
    now: new Date("2026-10-24T10:00:00.000Z"),
  });
  const { body } = await run(w);
  assertEquals(body, {
    due: 0,
    sent: 0,
    pruned: 0,
    failed: 0,
    materialised: 1,
  });
  assertEquals(JSON.parse(w.only(MATERIALISE).body), [
    { event_id: "s-london", occurrence_date: "2026-10-26", minutes_before: 30 },
  ]);
});

Deno.test("CAL-029 AC-4: run Monday 26 October 08:31Z, that row fires for 09:00 GMT (fire_at 08:30Z); UTC expansion would fire 07:30Z and miss it", async () => {
  const withRow: SeriesRow = {
    ...S_LONDON,
    reminders: [tmpl("t-london", 30), mat("m-26", "2026-10-26", 30)],
  };
  const now = new Date("2026-10-26T08:31:00.000Z");
  const w = world({ series: [withRow], now });
  const { body } = await run(w);
  assertEquals(body, {
    due: 1,
    sent: 1,
    pruned: 0,
    failed: 0,
    materialised: 0,
  });
  assertEquals(w.pushes.map((p) => p.payload.startsAt), [
    "2026-10-26T09:00:00.000Z",
  ]);
  assertEquals(w.pushes.map((p) => p.payload.eventId), ["s-london"]);
  assertEquals(patches(w), [patchKey("m-26")]);
  // the instant itself, and the control: UTC expansion's 08:00Z occurrence
  const london = candidate(
    "m-26",
    30,
    null,
    occurrence({
      seriesId: "s-london",
      occurrenceDate: "2026-10-26",
      startsAt: new Date("2026-10-26T09:00:00Z"),
      endsAt: new Date("2026-10-26T10:00:00Z"),
    }),
  );
  assertEquals(
    fireAt(london.occurrence.startsAt.toISOString(), 30).toISOString(),
    "2026-10-26T08:30:00.000Z",
  );
  const utc = candidate("m-26-utc", 30, null, {
    ...london.occurrence,
    startsAt: new Date("2026-10-26T08:00:00Z"),
  });
  assertEquals(
    dueOccurrences([london, utc], now).map((c: OccurrenceReminder) => c.id),
    ["m-26"],
  );
});

// ---------------------------------------------------------------- AC-5 at the handler

Deno.test("CAL-029 AC-5: a soft-deleted template fires nothing and materialises nothing, though a live row is due; restored, it fires", async () => {
  const deleted: SeriesRow = {
    ...S_DUE,
    reminders: [
      tmpl("t-due", 30, "2026-11-02T20:00:00+00:00"),
      mat("m-tue", "2026-11-03", 10),
    ],
  };
  const w = world({ series: [deleted] });
  const { body } = await run(w);
  assertEquals(body, {
    due: 0,
    sent: 0,
    pruned: 0,
    failed: 0,
    materialised: 0,
  });
  assertEquals(w.pushes.length, 0);
  assertEquals(w.keys(), [CANDIDATES, SERIES], "wrote, or read subscriptions");

  // the positive twin: the same rows with the template live (PO decision 3)
  const restored: SeriesRow = {
    ...deleted,
    reminders: [tmpl("t-due", 30), mat("m-tue", "2026-11-03", 10)],
  };
  const w2 = world({ series: [restored] });
  const r2 = await run(w2);
  assertEquals(r2.body, {
    due: 1,
    sent: 1,
    pruned: 0,
    failed: 0,
    materialised: 1,
  });
  assertEquals(JSON.parse(w2.only(MATERIALISE).body), [
    { event_id: "s-due", occurrence_date: "2026-11-04", minutes_before: 30 },
  ]);
  assertEquals(w2.pushes.map((p) => p.payload.eventId), ["s-due"]);
});
