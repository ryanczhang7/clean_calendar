import type { Database, Json } from "./database.types";

// Domain types and their mappers to and from PostgREST rows (CAL-005, AC-1).
// Rows are snake_case; the domain is camelCase. Event times (`startsAt`,
// `endsAt`) are `Date`s; the server's bookkeeping stamps (`createdAt`,
// `updatedAt`, `deletedAt`) stay its exact strings, because `updatedAt` is
// the token a conditional update sends back byte for byte and a `Date` would
// drop its microseconds. `occurrenceDate` is a calendar date, so a string.

type Tables = Database["public"]["Tables"];
export type KindRow = Tables["kinds"]["Row"];
export type EventRow = Tables["events"]["Row"];
export type EventOverrideRow = Tables["event_overrides"]["Row"];

export type Kind = {
  id: string;
  name: string;
  colorLight: string;
  colorDark: string;
  sortOrder: number;
  isDefault: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Recurrence = {
  freq: "daily" | "weekly" | "yearly";
  /** `YYYY-MM-DD`, as stored. */
  until: string | null;
  tz: string;
};

export type Event = {
  id: string;
  title: string;
  kindId: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  recurrence: Recurrence | null;
  origin: "manual" | "capture";
  captureJobId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** CAL-015 Block 6: set only by the cached events store from the outbox;
   *  never stored, never sent. Absent (no key at all) when nothing is pending. */
  sync?: "saving" | "failed";
  /** CAL-024 Block 3: set only on an expanded occurrence of a recurring
   *  series; never stored, never sent. Absent (no key) on a stored row. */
  occurrenceDate?: string;
};

export type EventOverride = {
  id: string;
  eventId: string;
  /** `YYYY-MM-DD` - a calendar date, never an instant. */
  occurrenceDate: string;
  cancelled: boolean;
  title: string | null;
  kindId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  allDay: boolean | null;
  location: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewKind = Omit<
  Kind,
  "id" | "createdAt" | "updatedAt" | "deletedAt"
>;
export type NewEvent = Omit<
  Event,
  "id" | "createdAt" | "updatedAt" | "deletedAt"
>;
export type NewEventOverride = Omit<
  EventOverride,
  "id" | "createdAt" | "updatedAt"
>;

export type KindPatch = Partial<NewKind>;
export type EventPatch = Partial<NewEvent>;
export type EventOverridePatch = Partial<NewEventOverride>;

type Bookkeeping = "id" | "created_at" | "updated_at" | "deleted_at";
export type KindInsert = Omit<KindRow, Bookkeeping>;
export type EventInsert = Omit<EventRow, Bookkeeping>;
export type EventOverrideInsert = Omit<EventOverrideRow, Bookkeeping>;

// --- helpers -----------------------------------------------------------------

function iso(d: Date): string;
function iso(d: Date | undefined): string | undefined;
function iso(d: Date | null): string | null;
function iso(d: Date | null | undefined): string | null | undefined;
function iso(d: Date | null | undefined): string | null | undefined {
  return d instanceof Date ? d.toISOString() : d;
}

function instantOrNull(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

// Sets `key` only when `value` was named: a PATCH body never carries a column
// the caller did not mention, and an `undefined` is "not mentioned".
function put<R, K extends keyof R>(
  out: Partial<R>,
  key: K,
  value: R[K] | undefined,
): void {
  if (value !== undefined) out[key] = value;
}

// `recurrence` is a jsonb column, typed `Json`. Validated structurally; a
// malformed value maps to null (the one lossy case the Contract states).
function toRecurrence(value: Json | null): Recurrence | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const { freq, until, tz } = value;
  if (freq !== "daily" && freq !== "weekly" && freq !== "yearly") return null;
  if (typeof tz !== "string") return null;
  if (until !== null && typeof until !== "string") return null;
  return { freq, until, tz };
}

// --- kinds -------------------------------------------------------------------

export function toKind(row: KindRow): Kind {
  return {
    id: row.id,
    name: row.name,
    colorLight: row.color_light,
    colorDark: row.color_dark,
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** CAL-015 Block 1: `id`, when given, is the id the client chose (PO decision 2). */
export function fromNewKind(
  kind: NewKind,
  id?: string,
): KindInsert & { id?: string } {
  const row: KindInsert = {
    name: kind.name,
    color_light: kind.colorLight,
    color_dark: kind.colorDark,
    sort_order: kind.sortOrder,
    is_default: kind.isDefault,
  };
  return id === undefined ? row : { id, ...row };
}

export function fromKind(kind: Kind): KindRow {
  return {
    id: kind.id,
    ...fromNewKind(kind),
    deleted_at: kind.deletedAt,
    created_at: kind.createdAt,
    updated_at: kind.updatedAt,
  };
}

export function fromKindPatch(patch: KindPatch): Partial<KindRow> {
  const out: Partial<KindRow> = {};
  put(out, "name", patch.name);
  put(out, "color_light", patch.colorLight);
  put(out, "color_dark", patch.colorDark);
  put(out, "sort_order", patch.sortOrder);
  put(out, "is_default", patch.isDefault);
  return out;
}

// --- events ------------------------------------------------------------------

export function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    title: row.title,
    kindId: row.kind_id,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    allDay: row.all_day,
    location: row.location,
    notes: row.notes,
    recurrence: toRecurrence(row.recurrence),
    // A check constraint admits only these two; the generated type says string.
    origin: row.origin === "capture" ? "capture" : "manual",
    captureJobId: row.capture_job_id,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** CAL-015 Block 1: `id`, when given, is the id the client chose (PO decision 2). */
export function fromNewEvent(
  event: NewEvent,
  id?: string,
): EventInsert & { id?: string } {
  const row: EventInsert = {
    title: event.title,
    kind_id: event.kindId,
    starts_at: iso(event.startsAt),
    ends_at: iso(event.endsAt),
    all_day: event.allDay,
    location: event.location,
    notes: event.notes,
    recurrence: event.recurrence,
    origin: event.origin,
    capture_job_id: event.captureJobId,
  };
  return id === undefined ? row : { id, ...row };
}

export function fromEvent(event: Event): EventRow {
  return {
    id: event.id,
    ...fromNewEvent(event),
    deleted_at: event.deletedAt,
    created_at: event.createdAt,
    updated_at: event.updatedAt,
  };
}

export function fromEventPatch(patch: EventPatch): Partial<EventRow> {
  const out: Partial<EventRow> = {};
  put(out, "title", patch.title);
  put(out, "kind_id", patch.kindId);
  put(out, "starts_at", iso(patch.startsAt));
  put(out, "ends_at", iso(patch.endsAt));
  put(out, "all_day", patch.allDay);
  put(out, "location", patch.location);
  put(out, "notes", patch.notes);
  put(out, "recurrence", patch.recurrence);
  put(out, "origin", patch.origin);
  put(out, "capture_job_id", patch.captureJobId);
  return out;
}

// --- event_overrides ---------------------------------------------------------

export function toEventOverride(row: EventOverrideRow): EventOverride {
  return {
    id: row.id,
    eventId: row.event_id,
    occurrenceDate: row.occurrence_date,
    cancelled: row.cancelled,
    title: row.title,
    kindId: row.kind_id,
    startsAt: instantOrNull(row.starts_at),
    endsAt: instantOrNull(row.ends_at),
    allDay: row.all_day,
    location: row.location,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function fromNewEventOverride(o: NewEventOverride): EventOverrideInsert {
  return {
    event_id: o.eventId,
    occurrence_date: o.occurrenceDate,
    cancelled: o.cancelled,
    title: o.title,
    kind_id: o.kindId,
    starts_at: iso(o.startsAt),
    ends_at: iso(o.endsAt),
    all_day: o.allDay,
    location: o.location,
    notes: o.notes,
  };
}

export function fromEventOverride(o: EventOverride): EventOverrideRow {
  return {
    id: o.id,
    ...fromNewEventOverride(o),
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}

export function fromEventOverridePatch(
  patch: EventOverridePatch,
): Partial<EventOverrideRow> {
  const out: Partial<EventOverrideRow> = {};
  put(out, "event_id", patch.eventId);
  put(out, "occurrence_date", patch.occurrenceDate);
  put(out, "cancelled", patch.cancelled);
  put(out, "title", patch.title);
  put(out, "kind_id", patch.kindId);
  put(out, "starts_at", iso(patch.startsAt));
  put(out, "ends_at", iso(patch.endsAt));
  put(out, "all_day", patch.allDay);
  put(out, "location", patch.location);
  put(out, "notes", patch.notes);
  return out;
}
