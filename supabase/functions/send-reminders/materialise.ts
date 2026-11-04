// CAL-029 Contract Block 2. Pure, no I/O: the series read's rows in, the
// materialisation plan out - which occurrence reminders to insert, and which
// existing materialised rows are candidates to fire this run.

import {
  expand,
  type Occurrence,
  type Override,
  type Range,
  type Recurrence,
  type Series,
} from "../../../shared/recurrence.ts";

/** AC-1: "the next 48 hours". */
export const LOOKAHEAD_MS = 48 * 3_600_000;
/** Equal to handler.ts's WINDOW_MS, by value. */
export const LOOKBACK_MS = 5 * 60_000;

/** One embedded reminder of a series, materialised or the template. */
export type SeriesReminderRow = {
  id: string;
  minutes_before: number;
  sent_at: string | null;
  /** null = the template */
  occurrence_date: string | null;
  deleted_at: string | null;
};
export type OverrideRow = {
  occurrence_date: string;
  cancelled: boolean;
  title: string | null;
  kind_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean | null;
  location: string | null;
  notes: string | null;
};
/** One row of the series read (Block 4), PostgREST shape. */
export type SeriesRow = {
  id: string;
  title: string;
  kind_id: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  /** jsonb; validated by toRecurrence */
  recurrence: unknown;
  reminders: SeriesReminderRow[];
  event_overrides: OverrideRow[];
};
export type NewReminder = {
  event_id: string;
  occurrence_date: string;
  minutes_before: number;
};
/** A live materialised row joined to the occurrence it is for. */
export type OccurrenceReminder = {
  id: string;
  minutes_before: number;
  sent_at: string | null;
  occurrence: Occurrence;
};
export type Plan = {
  inserts: NewReminder[];
  candidates: OccurrenceReminder[];
  skipped: { seriesId: string; reason: string }[];
};

/** src/data/rows.ts's rule, verbatim. */
export function toRecurrence(value: unknown): Recurrence | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const { freq, until, tz } = value as Record<string, unknown>;
  if (freq !== "daily" && freq !== "weekly" && freq !== "yearly") return null;
  if (typeof tz !== "string") return null;
  if (until !== null && typeof until !== "string") return null;
  return { freq, until, tz };
}

export function toSeries(row: SeriesRow, recurrence: Recurrence): Series {
  return {
    id: row.id,
    title: row.title,
    kindId: row.kind_id,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    allDay: row.all_day,
    location: row.location,
    notes: row.notes,
    recurrence: {
      freq: recurrence.freq,
      until: recurrence.until,
      tz: recurrence.tz,
    },
  };
}

/** null = keep the series value. */
export function toOverride(row: OverrideRow): Override {
  return {
    occurrenceDate: row.occurrence_date,
    cancelled: row.cancelled,
    title: row.title,
    kindId: row.kind_id,
    startsAt: row.starts_at === null ? null : new Date(row.starts_at),
    endsAt: row.ends_at === null ? null : new Date(row.ends_at),
    allDay: row.all_day,
    location: row.location,
    notes: row.notes,
  };
}

/** AC-5: a soft-deleted template is no template. */
export function liveTemplate(row: SeriesRow): SeriesReminderRow | null {
  return row.reminders.find((r) =>
    r.occurrence_date === null && r.deleted_at === null
  ) ?? null;
}

/** Half-open `[now - LOOKBACK_MS, now + LOOKAHEAD_MS)`, as `expand` reads it. */
export function expansionRange(now: Date): Range {
  const t = now.getTime();
  return { start: new Date(t - LOOKBACK_MS), end: new Date(t + LOOKAHEAD_MS) };
}

export function plan(rows: readonly SeriesRow[], now: Date): Plan {
  const out: Plan = { inserts: [], candidates: [], skipped: [] };
  const range = expansionRange(now);
  for (const row of rows) {
    const recurrence = toRecurrence(row.recurrence);
    if (recurrence === null) {
      out.skipped.push({ seriesId: row.id, reason: "recurrence" });
      continue;
    }
    const template = liveTemplate(row);
    if (template === null) continue;

    let occurrences: Occurrence[];
    try {
      occurrences = expand(
        toSeries(row, recurrence),
        row.event_overrides.map(toOverride),
        range,
      );
    } catch (err) {
      out.skipped.push({
        seriesId: row.id,
        reason: String((err as { message?: unknown })?.message ?? err),
      });
      continue;
    }

    const existing = new Set<string>();
    for (const r of row.reminders) {
      if (r.occurrence_date !== null) existing.add(r.occurrence_date);
    }
    const byDate = new Map<string, Occurrence>();
    for (const occ of occurrences) {
      byDate.set(occ.occurrenceDate, occ);
      if (!existing.has(occ.occurrenceDate)) {
        out.inserts.push({
          event_id: row.id,
          occurrence_date: occ.occurrenceDate,
          minutes_before: template.minutes_before,
        });
      }
    }
    for (const r of row.reminders) {
      if (r.occurrence_date === null || r.deleted_at !== null) continue;
      const occurrence = byDate.get(r.occurrence_date);
      if (occurrence === undefined) continue;
      out.candidates.push({
        id: r.id,
        minutes_before: r.minutes_before,
        sent_at: r.sent_at,
        occurrence,
      });
    }
  }
  return out;
}
