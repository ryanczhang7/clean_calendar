import { createClient } from "@supabase/supabase-js";

// The one module that imports supabase-js (architecture.md: the UI never
// calls it directly). Every test replaces this module whole with
// src/test/supabase-mock.ts, so it is excluded from coverage.

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

/** The one Google account the app admits (CAL-003); empty admits nobody. */
export const OWNER_EMAIL: string = import.meta.env.VITE_OWNER_EMAIL ?? "";
