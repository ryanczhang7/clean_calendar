import { vi } from "vitest";

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
  /** Forget every session, listener and recorded call. */
  reset(): void {
    current = null;
    listeners.clear();
    install();
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

/** What `vi.mock("../lib/supabase", …)` returns. */
export const supabaseModule = {
  supabase: { auth },
  OWNER_EMAIL,
};
