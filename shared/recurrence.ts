// CAL-023. Recurrence expansion, pure and import-free: it runs in the browser
// (Vite) and in Deno by relative path. Zone arithmetic uses Intl only.

export type Freq = "daily" | "weekly" | "yearly";
export type Recurrence = { freq: Freq; until: string | null; tz: string };

export type Series = {
  id: string;
  title: string;
  kindId: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  recurrence: Recurrence;
};

export type Override = {
  occurrenceDate: string;
  cancelled: boolean;
  title: string | null;
  kindId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  allDay: boolean | null;
  location: string | null;
  notes: string | null;
};

export type Range = { start: Date; end: Date };

export type Occurrence = {
  seriesId: string;
  occurrenceDate: string;
  title: string;
  kindId: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  location: string | null;
  notes: string | null;
};

// A wall-clock time in some zone, held as the epoch ms it would be in UTC.
type Wall = number;

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (f === undefined) {
    // Throws RangeError for an unknown zone (Block 6).
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

function toWall(instant: number, f: Intl.DateTimeFormat): Wall {
  const fields = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const p of f.formatToParts(instant)) {
    if (p.type in fields)
      fields[p.type as keyof typeof fields] = Number(p.value);
  }
  const ms = ((instant % 1000) + 1000) % 1000;
  return (
    Date.UTC(
      fields.year,
      fields.month - 1,
      fields.day,
      fields.hour % 24,
      fields.minute,
      fields.second,
    ) + ms
  );
}

function offsetAt(instant: number, f: Intl.DateTimeFormat): number {
  return toWall(instant, f) - instant;
}

// Wall time to instant. Ambiguous: the earlier instant. Nonexistent: the
// pre-transition offset (Block 3).
function fromWall(wall: Wall, f: Intl.DateTimeFormat): number {
  const before = offsetAt(wall - DAY_MS, f);
  const after = offsetAt(wall + DAY_MS, f);
  const valid: number[] = [];
  for (const o of before === after ? [before] : [before, after]) {
    const t = wall - o;
    if (offsetAt(t, f) === o) valid.push(t);
  }
  if (valid.length === 0) return wall - before;
  return Math.min(...valid);
}

function dateOf(wall: Wall): string {
  return new Date(wall).toISOString().slice(0, 10);
}

// Shift a wall time by k calendar steps, keeping h:m:s.ms. With `strict`, a
// yearly shift onto a date that does not exist (29 Feb) gives null; without
// it, Date.UTC rolls it over (used only for ends).
function shift(
  wall: Wall,
  freq: Freq,
  k: number,
  strict: boolean,
): Wall | null {
  const d = new Date(wall);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const time = wall - Date.UTC(y, m, day);
  if (freq === "yearly") {
    const shifted = Date.UTC(y + k, m, day);
    if (strict && new Date(shifted).getUTCDate() !== day) return null;
    return shifted + time;
  }
  const days = freq === "weekly" ? 7 * k : k;
  return Date.UTC(y, m, day + days) + time;
}

export function expand(
  series: Series,
  overrides: readonly Override[],
  range: Range,
): Occurrence[] {
  const { freq, until, tz } = series.recurrence;
  const f = formatterFor(tz);
  const startWall = toWall(series.startsAt.getTime(), f);
  const endWall = toWall(series.endsAt.getTime(), f);
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();

  const byDate = new Map<string, Override>();
  for (const o of overrides) byDate.set(o.occurrenceDate, o);

  const out: Occurrence[] = [];
  for (let k = 0; ; k++) {
    const sWall = shift(startWall, freq, k, true);
    if (sWall === null) continue;
    const occurrenceDate = dateOf(sWall);
    if (until !== null && occurrenceDate > until) break;
    let start: number;
    let end: number;
    if (k === 0) {
      start = series.startsAt.getTime();
      end = series.endsAt.getTime();
    } else {
      start = fromWall(sWall, f);
      // The end shifts by the same calendar step, not by elapsed ms.
      end = fromWall(shift(endWall, freq, k, false) as Wall, f);
    }
    if (start >= rangeEnd) break;
    if (!(end > rangeStart)) continue;

    const o = byDate.get(occurrenceDate);
    if (o?.cancelled) continue;
    out.push({
      seriesId: series.id,
      occurrenceDate,
      title: o?.title ?? series.title,
      kindId: o?.kindId ?? series.kindId,
      startsAt: new Date(o?.startsAt?.getTime() ?? start),
      endsAt: new Date(o?.endsAt?.getTime() ?? end),
      allDay: o?.allDay ?? series.allDay,
      location: o?.location ?? series.location,
      notes: o?.notes ?? series.notes,
    });
  }
  return out;
}
