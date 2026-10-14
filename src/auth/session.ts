import { useEffect, useState } from "react";
import { OWNER_EMAIL, supabase } from "../lib/supabase";

// CAL-003 Contract, Session. Supabase Auth is the session authority
// (architecture.md, "Where state lives"); this module only classifies it.

function normalise(address: string | null | undefined): string {
  return (address ?? "").trim().toLowerCase();
}

/**
 * True only when `email` is exactly the owner's address, ignoring case and
 * surrounding whitespace. Both sides are normalised BEFORE the emptiness
 * check, so an owner configured as spaces admits nobody.
 */
export function isOwnerEmail(
  email: string | null | undefined,
  owner: string = OWNER_EMAIL,
): boolean {
  const wanted = normalise(owner);
  const given = normalise(email);
  return wanted !== "" && given !== "" && given === wanted;
}

export type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "owner"; email: string }
  | { status: "other"; email: string };

type MaybeSession = { user?: { email?: string | null } | null } | null;

function classify(session: MaybeSession): SessionState {
  const email = session?.user?.email;
  if (!session || !email) return { status: "signed-out" };
  return isOwnerEmail(email)
    ? { status: "owner", email }
    : { status: "other", email };
}

/** The current session, classified; `loading` until getSession answers. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (live) setState(classify(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(classify(session));
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return state;
}

/** Starts the Google OAuth redirect, returning to this origin. */
export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/` },
  });
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** sessionStorage, so a stale target does not outlive the tab. */
export const RETURN_TO_KEY = "cc.returnTo";

export function rememberPath(path: string): void {
  sessionStorage.setItem(RETURN_TO_KEY, path);
}

/** Reads and clears the remembered path; `/` when there is none. */
export function takeReturnTo(): string {
  const path = sessionStorage.getItem(RETURN_TO_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
  return path ?? "/";
}
