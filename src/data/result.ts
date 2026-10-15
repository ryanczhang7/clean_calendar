import type { PostgrestError } from "@supabase/supabase-js";

// What a repository call resolves to (CAL-005, AC-4 and AC-6). None throws.

export type Failure =
  | { status: "error"; code: string; message: string }
  | { status: "offline" };

export type Result<T> =
  | { status: "ok"; row: T }
  | { status: "conflict" }
  | Failure;

export type ListResult<T> = { status: "ok"; rows: T[] } | Failure;

type PostgrestReply<Row> = {
  data: Row[] | null;
  error: PostgrestError | null;
  status: number;
};

// Measured by RED (supabase-js 2.117): a rejected fetch resolves with
// `status: 0` and an error whose `code` is ""; an HTTP error response
// resolves with its own status (>= 400) and PostgREST's code. The HTTP status
// is the discriminator - never the message text.
function failure(error: PostgrestError, status: number): Failure {
  if (status === 0) return { status: "offline" };
  return { status: "error", code: error.code, message: error.message };
}

export function fromPostgrest<Row, T>(
  res: PostgrestReply<Row>,
  map: (row: Row) => T,
): ListResult<T> {
  if (res.error !== null) return failure(res.error, res.status);
  return { status: "ok", rows: (res.data ?? []).map(map) };
}

// For a write that returns the affected rows: one row is ok; zero rows means
// the filter matched nothing - for a conditional update, someone else changed
// the row first - which is a conflict, not an error.
export function fromPostgrestOne<Row, T>(
  res: PostgrestReply<Row>,
  map: (row: Row) => T,
): Result<T> {
  if (res.error !== null) return failure(res.error, res.status);
  const row = res.data?.[0];
  if (row === undefined) return { status: "conflict" };
  return { status: "ok", row: map(row) };
}
