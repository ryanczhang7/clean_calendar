import { execSync } from "node:child_process";
import { ensureOwnerUser } from "./fixtures/session.ts";

// CAL-031 Contract Block 1: once per run, a fresh local database (AC-1's
// "Given"), then the owner's Auth user. `db reset` re-applies the migrations
// and supabase/seed.sql, which puts owner@example.com in app_config; it also
// empties auth.users, so the user is created after it, never before.
//
// The existing specs (boot, offline-shell, pwa-build) need neither, and still
// run with no session.

export default async function globalSetup(): Promise<void> {
  execSync("pnpm exec supabase db reset --local", { stdio: "inherit" });
  await ensureOwnerUser();
}
