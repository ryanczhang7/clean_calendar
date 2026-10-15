// AC-1's identity comparison (CAL-005). A round trip of every column is the
// identity: byte for byte on every column, except the Date-typed event
// times, which are equal as instants (`from*` writes `toISOString()`, so
// "+00:00" comes back as ".000Z"). Returns one line per column that did not
// survive - empty means identity - so a failure lists every lost column
// rather than only the first.
//
// "Byte for byte" is the JSON serialisation of each value, with one
// deliberate exception: object keys are sorted first. The only object-valued
// column is `events.recurrence`, a `jsonb`, and Postgres does not keep jsonb
// key order (it returns {"tz","freq","until"}, shortest key first), so key
// order is not part of the value. Every key, every value and every type is
// still compared exactly.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

export function roundTripMismatches(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  instantColumns: readonly string[],
): string[] {
  const out: string[] = [];
  const keysBefore = Object.keys(before).sort();
  const keysAfter = Object.keys(after).sort();
  if (JSON.stringify(keysBefore) !== JSON.stringify(keysAfter)) {
    out.push(
      `columns differ: row has [${keysBefore}], round trip has [${keysAfter}]`,
    );
  }
  for (const key of keysBefore) {
    const a = before[key];
    const b = after[key];
    if (instantColumns.includes(key) && a !== null) {
      const ia = Date.parse(String(a));
      const ib = typeof b === "string" ? Date.parse(b) : Number.NaN;
      if (Number.isNaN(ia) || ia !== ib) {
        out.push(`${key}: ${String(a)} is not the instant ${String(b)}`);
      }
    } else if (canonical(a) !== canonical(b)) {
      out.push(`${key}: ${canonical(a)} became ${canonical(b)}`);
    }
  }
  return out;
}
