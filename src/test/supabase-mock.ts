import { createClient } from "@supabase/supabase-js";
import { HttpResponse } from "msw";
import { vi } from "vitest";
import type { Database } from "../data/database.types";
import type { EventRow } from "../data/rows";
import { onTable, type Recorded, TEST_ORIGIN } from "./msw";
import { fakeRealtimeClient } from "./realtime-fixtures";

// The fake `src/lib/supabase.ts` every CAL-003 test mocks in (CAL-003
// Contract, Supabase client). Use it with
//
//   vi.mock("../lib/supabase", async () =>
//     (await import("../test/supabase-mock")).supabaseModule,
//   );
//
// and call `fake.reset()` in a beforeEach. The factory's dynamic import and
// the test file's static import resolve to the same module instance, so the
// test drives exactly the `auth` the code under test was handed.
//
// Behaviour copied from supabase-js v2, and nothing more:
//   * getSession() resolves { data: { session }, error: null } - always
//     asynchronously, so a first render always sees no answer yet;
//   * onAuthStateChange(cb) returns { data: { subscription: { unsubscribe } } };
//     it does NOT emit INITIAL_SESSION by itself (tests emit explicitly);
//   * signOut() clears the session and notifies every subscriber with
//     ("SIGNED_OUT", null) before it resolves, as supabase-js does;
//   * signInWithOAuth() resolves and changes nothing (the real one leaves
//     the page for Google).

export const OWNER_EMAIL = "owner@example.com";

export type FakeSession = { user: { email?: string | null } } | null;
type Listener = (event: string, session: FakeSession) => void;
type AuthResult = { error: null };
type SessionResult = { data: { session: FakeSession }; error: null };
type Subscription = { data: { subscription: { unsubscribe: () => void } } };
type OAuthArgs = { provider: string; options?: { redirectTo?: string } };
type OAuthResult = {
  data: { provider: string; url: string };
  error: null;
};

/** A session for `email`, in the shape supabase-js hands out. */
export function sessionFor(email: string): Exclude<FakeSession, null> {
  return { user: { email } };
}

let current: FakeSession = null;
const listeners = new Set<Listener>();

const auth = {
  getSession: vi.fn<() => Promise<SessionResult>>(),
  onAuthStateChange: vi.fn<(callback: Listener) => Subscription>(),
  signInWithOAuth: vi.fn<(args: OAuthArgs) => Promise<OAuthResult>>(),
  signOut: vi.fn<() => Promise<AuthResult>>(),
};

/** The Realtime channel stub (CAL-016; see the note beside `client` below). */
const realtime = fakeRealtimeClient();

/** Every subscription's unsubscribe, counted together. */
const unsubscribe = vi.fn<() => void>();

function emit(event: string, session: FakeSession): void {
  current = session;
  for (const listener of [...listeners]) listener(event, session);
}

function install(): void {
  auth.getSession.mockReset();
  auth.getSession.mockImplementation(async () => ({
    data: { session: current },
    error: null,
  }));
  auth.onAuthStateChange.mockReset();
  auth.onAuthStateChange.mockImplementation((callback) => {
    listeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            listeners.delete(callback);
            unsubscribe();
          },
        },
      },
    };
  });
  auth.signInWithOAuth.mockReset();
  auth.signInWithOAuth.mockImplementation(async (args) => ({
    data: { provider: args.provider, url: "https://accounts.google.test/" },
    error: null,
  }));
  auth.signOut.mockReset();
  auth.signOut.mockImplementation(async () => {
    emit("SIGNED_OUT", null);
    return { error: null };
  });
  unsubscribe.mockReset();
}

install();

export const fake = {
  auth,
  unsubscribe,
  /** The app client's Realtime channel stub: what `channel()` returned, and every call. */
  realtime,
  /** Forget every session, listener and recorded call. */
  reset(): void {
    current = null;
    listeners.clear();
    install();
    realtime.clear();
  },
  /** The session getSession() will resolve with from now on. */
  setSession(session: FakeSession): void {
    current = session;
  },
  /** Notify every subscriber, as supabase-js does on a sign-in or -out. */
  emit,
  /**
   * Make the next getSession() hang until `resolve` is called, so a test can
   * observe the state before the session is known.
   */
  holdSession(): { resolve: (session: FakeSession) => void } {
    let release: (session: FakeSession) => void = () => {};
    auth.getSession.mockImplementationOnce(
      () =>
        new Promise<SessionResult>((done) => {
          release = (session) => {
            current = session;
            done({ data: { session }, error: null });
          };
        }),
    );
    return { resolve: (session) => release(session) };
  },
  /** How many onAuthStateChange subscriptions are still live. */
  listenerCount(): number {
    return listeners.size;
  },
};

// CAL-006 Contract, Block 7. The mocked `supabase` is a REAL supabase-js
// client aimed at TEST_ORIGIN, so `supabase.from("kinds")` is a real
// PostgREST fetch that MSW (src/test/msw.ts) answers - and a request nobody
// answers fails the test. Only its `auth` is the fake above.
//
// `accessToken: async () => null` (RED amendment to Block 7): without it,
// supabase-js 2.117 calls `this.auth.getSession()` before EVERY PostgREST
// request to find a bearer token - i.e. the fake's getSession - which would
// add calls to its recorded count and could consume a `holdSession()` meant
// for the app. With the option set, a request never touches `auth` and is
// sent with the anon key; supabase-js replaces `auth` with a throwing Proxy,
// which the defineProperty below then replaces with the fake.
const client = createClient<Database>(TEST_ORIGIN, "test-anon-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { retry: false },
  accessToken: async () => null,
});
Object.defineProperty(client, "auth", {
  value: auth,
  configurable: true,
  writable: true,
});

// CAL-016 Contract, callers list: `installOnlineSync()` starts the app's
// Realtime stream, so every suite that renders the app's SyncStatus (the
// shell, the routes, the calendar page) reaches `supabase.channel(...)`.
// Measured in CAL-016 RED (2026-10-22, local): the real client's
// `subscribe()` opens ws://supabase.test/realtime/v1/websocket, which MSW
// refuses with "[MSW] Error: intercepted a WebSocket connection without a
// matching event handler" on stderr, the channel reports CHANNEL_ERROR
// ("transport failure") within ~3 ms, and the socket keeps reconnecting on
// timers. So `channel` / `removeChannel` are the fake below, as `auth` is:
// a channel records its bindings and reports no status until a test calls
// `report(status)`. `fake.realtime` is the recorder; `fake.reset()` clears it.
Object.defineProperty(client, "channel", {
  value: realtime.channel,
  configurable: true,
  writable: true,
});
Object.defineProperty(client, "removeChannel", {
  value: realtime.removeChannel,
  configurable: true,
  writable: true,
});

/** What `vi.mock("../lib/supabase", …)` returns. */
export const supabaseModule = {
  supabase: client,
  OWNER_EMAIL,
};

/**
 * Answer the owner-path seed (CAL-006) where the seed is not what the test is
 * about: a GET on `kinds` finds an empty table, and the POST that follows is
 * echoed back as the inserted rows. Call it after `installServer()` has been
 * called at the file's top level, in a beforeEach. Returns the recorded
 * requests.
 */
export function answerKindsSeed(): Recorded[] {
  return onTable("kinds", (req) => {
    if (req.method !== "POST") return HttpResponse.json([]);
    const inputs = Array.isArray(req.body) ? req.body : [req.body];
    const rows = inputs.map((input, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      ...(input as object),
      deleted_at: null,
      created_at: "2026-10-16T08:00:00.000001+00:00",
      updated_at: "2026-10-16T08:00:00.000001+00:00",
    }));
    return HttpResponse.json(rows, { status: 201 });
  });
}

/**
 * Answer the calendar page's events read (CAL-009 Contract, Block 9) where
 * the events are not what the test is about: every request on `events` is
 * answered with `rows` (an empty table by default). Without it the page's
 * `GET /rest/v1/events` is unhandled - measured in CAL-009 RED: MSW's "error"
 * strategy prints "[MSW] Error: intercepted a request without a matching
 * request handler" to stderr and the fetch rejects, so the repository
 * resolves `offline` and the test still passes, dirty. Call it beside
 * `answerKindsSeed()` in a beforeEach. Returns the recorded requests.
 */
export function answerEvents(rows: EventRow[] = []): Recorded[] {
  return onTable("events", () => HttpResponse.json(rows));
}
