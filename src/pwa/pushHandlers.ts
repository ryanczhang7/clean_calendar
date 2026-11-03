// CAL-028 Contract Block 5: the service worker's push and notificationclick
// handlers as plain functions. No imports (the worker never pulls the cache
// schema or date-fns), typed structurally so this compiles under both the DOM
// lib (tsconfig.json, where the tests run) and the WebWorker lib
// (tsconfig.sw.json). The device formats: time and day are in its own zone.

export type ReminderPayload = {
  eventId: string;
  title: string;
  startsAt: string;
  allDay: boolean;
  location: string | null;
};

/** The push event's JSON, or null when absent or not JSON. */
export function pushData(
  data: { json(): unknown } | null | undefined,
): unknown {
  if (data === null || data === undefined) return null;
  try {
    return data.json();
  } catch {
    return null;
  }
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v !== "";

export function parseReminderPayload(data: unknown): ReminderPayload | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const d = data as Record<string, unknown>;
  const { eventId, title, startsAt, allDay } = d;
  const location = d.location === undefined ? null : d.location;
  if (!nonEmpty(eventId) || !nonEmpty(title)) return null;
  if (typeof startsAt !== "string" || Number.isNaN(Date.parse(startsAt))) {
    return null;
  }
  if (typeof allDay !== "boolean") return null;
  if (location !== null && typeof location !== "string") return null;
  return { eventId, title, startsAt, allDay, location };
}

export function reminderBody(p: ReminderPayload, timeZone?: string): string {
  if (p.allDay) return "All day";
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(p.startsAt));
  return nonEmpty(p.location) ? `${time} · ${p.location}` : time;
}

export function reminderUrl(p: ReminderPayload, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date(p.startsAt));
  const part = (type: string) => parts.find((x) => x.type === type)?.value;
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  return `/day/${day}?event=${encodeURIComponent(p.eventId)}`;
}

export type NotificationTarget = {
  showNotification(
    title: string,
    options: { body: string; data: { url: string }; tag: string },
  ): Promise<void>;
};

export async function showReminder(
  target: NotificationTarget,
  data: unknown,
): Promise<void> {
  const p = parseReminderPayload(data);
  if (p === null) return;
  await target.showNotification(p.title, {
    body: reminderBody(p),
    data: { url: reminderUrl(p) },
    tag: p.eventId,
  });
}

export type WindowClientLike = {
  focus(): Promise<unknown>;
  navigate(url: string): Promise<unknown>;
};
export type ClientsLike = {
  matchAll(options: {
    type: "window";
    includeUncontrolled: true;
  }): Promise<readonly WindowClientLike[]>;
  openWindow(url: string): Promise<unknown>;
};

export async function openReminder(
  clients: ClientsLike,
  url: string,
): Promise<void> {
  const windows = await clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const first = windows[0];
  if (first !== undefined) {
    await first.focus();
    await first.navigate(url);
  } else {
    await clients.openWindow(url);
  }
}
