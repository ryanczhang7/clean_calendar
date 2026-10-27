import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Database } from "./database.types";
import { fromPostgrestOne, type Result } from "./result";

// The capture job repository (CAL-020 Contract, Block 6). It only ever
// updates `status`: jobs are created by the capture function (CAL-018). The
// update goes straight to PostgREST, not through the outbox (PO decision 5).

export type CaptureJobStatus = "confirmed" | "discarded";

export type CaptureJobsRepo = {
  /** PATCH /rest/v1/capture_jobs?id=eq.<id> with {status}; zero rows back is `conflict`. */
  setStatus(
    id: string,
    status: CaptureJobStatus,
  ): Promise<Result<{ id: string; status: string }>>;
};

export function captureJobsRepo(
  client: SupabaseClient<Database>,
): CaptureJobsRepo {
  return {
    // `.select()`, never `.single()`, so zero rows is data, not an error.
    setStatus: async (id, status) =>
      fromPostgrestOne(
        await client
          .from("capture_jobs")
          .update({ status })
          .eq("id", id)
          .select("id, status"),
        (row) => ({ id: row.id, status: row.status }),
      ),
  };
}

export const captureJobs: CaptureJobsRepo = captureJobsRepo(supabase);
