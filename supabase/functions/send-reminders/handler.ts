// The send-reminders edge function (CAL-028 Contract Block 2). pg_cron posts
// here every minute with the service-role JWT; this selects the due reminders,
// pushes each to every subscription, prunes the gone ones and marks sent_at.
// Every outbound call goes through deps.fetch / deps.sendPush.

import { bearer, jsonResponse } from "../_shared/owner.ts";

export type Subscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};
export type PushPayload = {
  eventId: string;
  title: string;
  startsAt: string;
  allDay: boolean;
  location: string | null;
};
export type PushOutcome =
  | { status: "sent" }
  | { status: "gone"; code: 404 | 410 }
  | { status: "failed"; code: number | null; message: string };
export type ReminderRow = {
  id: string;
  minutes_before: number;
  sent_at: string | null;
  event: {
    id: string;
    title: string;
    starts_at: string;
    all_day: boolean;
    location: string | null;
  };
};
export type SendDeps = {
  fetch: typeof fetch;
  env: (name: string) => string | undefined;
  now: () => Date;
  /** null when the VAPID secrets are not set (index.ts decides) */
  sendPush:
    | ((sub: Subscription, payload: PushPayload) => Promise<PushOutcome>)
    | null;
  log: (line: string) => void;
};

export const WINDOW_MS = 5 * 60_000;

function base64UrlDecode(segment: string): string {
  const b64 = segment.replaceAll("-", "+").replaceAll("_", "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** A bearer JWT whose payload's `role` is exactly `service_role`. No signature check: the gateway did it. */
export function isServiceRole(req: Request): boolean {
  const header = bearer(req);
  if (header === null) return false;
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const claims: unknown = JSON.parse(base64UrlDecode(parts[1]!));
    return typeof claims === "object" && claims !== null &&
      !Array.isArray(claims) &&
      (claims as Record<string, unknown>).role === "service_role";
  } catch {
    return false;
  }
}

export function fireAt(startsAt: string, minutesBefore: number): Date {
  return new Date(Date.parse(startsAt) - minutesBefore * 60_000);
}

export function isDue(fireAt: Date, sentAt: string | null, now: Date): boolean {
  const fire = fireAt.getTime();
  const t = now.getTime();
  return t - WINDOW_MS <= fire && fire <= t &&
    (sentAt === null || Date.parse(sentAt) < fire - WINDOW_MS);
}

export function dueReminders(rows: ReminderRow[], now: Date): ReminderRow[] {
  return rows.filter((r) =>
    isDue(fireAt(r.event.starts_at, r.minutes_before), r.sent_at, now)
  );
}

export function payloadFor(row: ReminderRow): PushPayload {
  return {
    eventId: row.event.id,
    title: row.event.title,
    startsAt: row.event.starts_at,
    allDay: row.event.all_day,
    location: row.event.location === "" ? null : row.event.location,
  };
}

const CANDIDATES_QUERY =
  "select=id,minutes_before,sent_at,event:events!inner(id,title,starts_at,all_day,location)" +
  "&deleted_at=is.null&occurrence_date=is.null&event.deleted_at=is.null&event.recurrence=is.null";

/** GET a JSON array, or null on a non-2xx, a throw or a non-array body. */
async function readArray<T>(
  deps: SendDeps,
  url: string,
  headers: Record<string, string>,
): Promise<T[] | null> {
  try {
    const res = await deps.fetch(url, { method: "GET", headers });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return Array.isArray(body) ? (body as T[]) : null;
  } catch {
    return null;
  }
}

export async function handleSendReminders(
  req: Request,
  deps: SendDeps,
): Promise<Response> {
  if (!isServiceRole(req)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return jsonResponse({ error: "method" }, 405);
  const sendPush = deps.sendPush;
  if (sendPush === null) {
    return jsonResponse({ error: "vapid not configured" }, 503);
  }

  const base = `${deps.env("SUPABASE_URL")}/rest/v1`;
  const key = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = { apikey: key, authorization: `Bearer ${key}` };
  const upstream = () => jsonResponse({ error: "upstream" }, 502);

  const rows = await readArray<ReminderRow>(
    deps,
    `${base}/reminders?${CANDIDATES_QUERY}`,
    auth,
  );
  if (rows === null) return upstream();
  const due = dueReminders(rows, deps.now());
  const counts = { due: due.length, sent: 0, pruned: 0, failed: 0 };
  if (due.length === 0) return jsonResponse(counts, 200);

  const subs = await readArray<Subscription>(
    deps,
    `${base}/push_subscriptions?select=id,endpoint,p256dh,auth`,
    auth,
  );
  if (subs === null) return upstream();

  const gone = new Set<string>();
  for (const row of due) {
    const payload = payloadFor(row);
    for (const sub of subs) {
      if (gone.has(sub.id)) continue;
      const outcome = await sendPush(sub, payload);
      if (outcome.status === "sent") {
        counts.sent++;
      } else if (outcome.status === "gone") {
        gone.add(sub.id);
        counts.pruned++;
        try {
          const res = await deps.fetch(
            `${base}/push_subscriptions?id=eq.${sub.id}`,
            { method: "DELETE", headers: auth },
          );
          if (!res.ok) {
            deps.log(
              `send-reminders: delete of subscription ${sub.id} failed: ${res.status}`,
            );
          }
        } catch (err) {
          deps.log(
            `send-reminders: delete of subscription ${sub.id} failed: ${
              String((err as { message?: unknown })?.message ?? err)
            }`,
          );
        }
      } else {
        counts.failed++;
        deps.log(
          `send-reminders: push to ${sub.id} failed: ${outcome.code} ${outcome.message}`,
        );
      }
    }
    try {
      await deps.fetch(`${base}/reminders?id=eq.${row.id}`, {
        method: "PATCH",
        headers: {
          ...auth,
          prefer: "return=minimal",
          "content-type": "application/json",
        },
        body: JSON.stringify({ sent_at: deps.now().toISOString() }),
      });
    } catch (err) {
      deps.log(
        `send-reminders: marking reminder ${row.id} sent failed: ${
          String((err as { message?: unknown })?.message ?? err)
        }`,
      );
    }
  }
  return jsonResponse(counts, 200);
}
