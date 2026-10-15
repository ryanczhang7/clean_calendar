import type { Database } from "../data/database.types";
import type { Event, EventOverride, Kind } from "../data/rows";

// Rows as PostgREST returns them (CAL-005 Contract, AC-1): timestamps carry
// the server's `+00:00` suffix; the bookkeeping stamps (created_at,
// updated_at, deleted_at) carry microseconds, which a `Date` cannot hold;
// the event times (starts_at, ends_at) carry none, because the client writes
// them at millisecond precision. Each table has a FULL row (every column
// non-null and non-default) and a NULLS row (every nullable column null).
//
// The expected domain objects are written out by hand rather than computed
// with the mappers, so a repository test does not take its oracle from the
// code under test.

type Tables = Database["public"]["Tables"];
export type KindRow = Tables["kinds"]["Row"];
export type EventRow = Tables["events"]["Row"];
export type EventOverrideRow = Tables["event_overrides"]["Row"];

export const KIND_ID = "0b6f7c1e-3d0a-4c55-9a51-6a2f6f0e9a01";
export const KIND_ID_2 = "0b6f7c1e-3d0a-4c55-9a51-6a2f6f0e9a02";
export const EVENT_ID = "5e1d2c3b-4a59-4687-b7c8-d9e0f1a2b301";
export const EVENT_ID_2 = "5e1d2c3b-4a59-4687-b7c8-d9e0f1a2b302";
export const OVERRIDE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01";
export const OVERRIDE_ID_2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c02";
export const CAPTURE_JOB_ID = "c0ffee00-1234-4567-89ab-cdef01234567";

// A token the conditional update must send back exactly: six fractional
// digits and a `+00:00` offset, both of which a Date round trip would lose.
export const UPDATED_AT = "2026-10-14T09:15:02.123456+00:00";
export const CREATED_AT = "2026-10-01T08:00:00.654321+00:00";
export const DELETED_AT = "2026-10-14T09:15:02.123456+00:00";

// --- kinds -----------------------------------------------------------------

export const kindRowFull: KindRow = {
  id: KIND_ID,
  name: "Work",
  color_light: "#1a73e8",
  color_dark: "#8ab4f8",
  sort_order: 3,
  is_default: true,
  deleted_at: DELETED_AT,
  created_at: CREATED_AT,
  updated_at: UPDATED_AT,
};

export const kindFull: Kind = {
  id: KIND_ID,
  name: "Work",
  colorLight: "#1a73e8",
  colorDark: "#8ab4f8",
  sortOrder: 3,
  isDefault: true,
  deletedAt: DELETED_AT,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const kindRowNulls: KindRow = {
  id: KIND_ID_2,
  name: "Family",
  color_light: "#e8711a",
  color_dark: "#f8b48a",
  sort_order: 0,
  is_default: false,
  deleted_at: null,
  created_at: "2026-09-30T23:59:59.000001+00:00",
  updated_at: "2026-10-02T12:00:00.5+00:00",
};

export const kindNulls: Kind = {
  id: KIND_ID_2,
  name: "Family",
  colorLight: "#e8711a",
  colorDark: "#f8b48a",
  sortOrder: 0,
  isDefault: false,
  deletedAt: null,
  createdAt: "2026-09-30T23:59:59.000001+00:00",
  updatedAt: "2026-10-02T12:00:00.5+00:00",
};

// --- events ----------------------------------------------------------------

export const eventRowFull: EventRow = {
  id: EVENT_ID,
  title: "Quarterly review",
  kind_id: KIND_ID,
  starts_at: "2026-10-20T09:00:00+00:00",
  ends_at: "2026-10-20T10:30:00+00:00",
  all_day: true,
  location: "Room 4",
  notes: "Bring the slides",
  // jsonb key order, as Postgres returns it: shortest key first.
  recurrence: { tz: "Europe/London", freq: "weekly", until: "2026-12-31" },
  origin: "capture",
  capture_job_id: CAPTURE_JOB_ID,
  deleted_at: DELETED_AT,
  created_at: CREATED_AT,
  updated_at: UPDATED_AT,
};

export const eventFull: Event = {
  id: EVENT_ID,
  title: "Quarterly review",
  kindId: KIND_ID,
  startsAt: new Date("2026-10-20T09:00:00Z"),
  endsAt: new Date("2026-10-20T10:30:00Z"),
  allDay: true,
  location: "Room 4",
  notes: "Bring the slides",
  recurrence: { freq: "weekly", until: "2026-12-31", tz: "Europe/London" },
  origin: "capture",
  captureJobId: CAPTURE_JOB_ID,
  deletedAt: DELETED_AT,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const eventRowNulls: EventRow = {
  id: EVENT_ID_2,
  title: "Dentist",
  kind_id: KIND_ID_2,
  starts_at: "2026-11-03T14:15:00+00:00",
  ends_at: "2026-11-03T15:00:00+00:00",
  all_day: false,
  location: null,
  notes: null,
  recurrence: null,
  origin: "manual",
  capture_job_id: null,
  deleted_at: null,
  created_at: "2026-10-02T07:30:00.000002+00:00",
  updated_at: "2026-10-02T07:30:00.000002+00:00",
};

export const eventNulls: Event = {
  id: EVENT_ID_2,
  title: "Dentist",
  kindId: KIND_ID_2,
  startsAt: new Date("2026-11-03T14:15:00Z"),
  endsAt: new Date("2026-11-03T15:00:00Z"),
  allDay: false,
  location: null,
  notes: null,
  recurrence: null,
  origin: "manual",
  captureJobId: null,
  deletedAt: null,
  createdAt: "2026-10-02T07:30:00.000002+00:00",
  updatedAt: "2026-10-02T07:30:00.000002+00:00",
};

// --- event_overrides ---------------------------------------------------------

export const overrideRowFull: EventOverrideRow = {
  id: OVERRIDE_ID,
  event_id: EVENT_ID,
  occurrence_date: "2026-10-27",
  cancelled: true,
  title: "Quarterly review (moved)",
  kind_id: KIND_ID_2,
  starts_at: "2026-10-27T13:00:00+00:00",
  ends_at: "2026-10-27T14:30:00+00:00",
  all_day: true,
  location: "Room 9",
  notes: "Moved after lunch",
  created_at: CREATED_AT,
  updated_at: UPDATED_AT,
};

export const overrideFull: EventOverride = {
  id: OVERRIDE_ID,
  eventId: EVENT_ID,
  occurrenceDate: "2026-10-27",
  cancelled: true,
  title: "Quarterly review (moved)",
  kindId: KIND_ID_2,
  startsAt: new Date("2026-10-27T13:00:00Z"),
  endsAt: new Date("2026-10-27T14:30:00Z"),
  allDay: true,
  location: "Room 9",
  notes: "Moved after lunch",
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const overrideRowNulls: EventOverrideRow = {
  id: OVERRIDE_ID_2,
  event_id: EVENT_ID,
  occurrence_date: "2026-11-03",
  cancelled: false,
  title: null,
  kind_id: null,
  starts_at: null,
  ends_at: null,
  all_day: null,
  location: null,
  notes: null,
  created_at: "2026-10-03T10:00:00.000003+00:00",
  updated_at: "2026-10-03T10:00:00.000003+00:00",
};

export const overrideNulls: EventOverride = {
  id: OVERRIDE_ID_2,
  eventId: EVENT_ID,
  occurrenceDate: "2026-11-03",
  cancelled: false,
  title: null,
  kindId: null,
  startsAt: null,
  endsAt: null,
  allDay: null,
  location: null,
  notes: null,
  createdAt: "2026-10-03T10:00:00.000003+00:00",
  updatedAt: "2026-10-03T10:00:00.000003+00:00",
};
