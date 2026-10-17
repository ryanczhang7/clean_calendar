import type { Kind } from "../data/rows";
import { initialOf } from "../kinds/KindList";

// CAL-009 AC-8, Contract Block 2. One letter unless another kind in the list
// shares it case-insensitively; then the first two code points of the
// trimmed name, the first upper-cased and the second as written.

/** Kind id -> the initial its chips show. */
export function kindInitials(kinds: Kind[]): Map<string, string> {
  const counts = new Map<string, number>();
  const firsts = kinds.map((k) => initialOf(k.name));
  for (const first of firsts) {
    if (first !== "") counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  return new Map(
    kinds.map((k, i) => {
      const first = firsts[i] ?? "";
      if ((counts.get(first) ?? 0) < 2) return [k.id, first];
      const second = Array.from(k.name.trim())[1] ?? "";
      return [k.id, first + second];
    }),
  );
}
