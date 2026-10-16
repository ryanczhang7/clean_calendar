import type { NewKind } from "../data/rows";

// The eleven default kinds (CAL-006, AC-1), exactly as
// docs/wiki/design/kinds-palette.md lists them: its order, its names, its
// hexes in upper case. Seeded on the owner's first sign-in (seedKinds.ts).

function kind(
  sortOrder: number,
  name: string,
  colorLight: string,
  colorDark: string,
): NewKind {
  return { name, colorLight, colorDark, sortOrder, isDefault: true };
}

export const DEFAULT_KINDS: readonly NewKind[] = Object.freeze([
  kind(1, "Movies", "#7E3FB8", "#CFA8F0"),
  kind(2, "Entertainment", "#BD8200", "#F5CC6A"),
  kind(3, "Flights", "#0B6E80", "#7AD4E4"),
  kind(4, "Hotel stays", "#5147C9", "#B3AEF7"),
  kind(5, "Other travel", "#0D7265", "#74D3C2"),
  kind(6, "Restaurant reservations", "#BF4A17", "#F5A47C"),
  kind(7, "Birthdays", "#C2185B", "#F39BBE"),
  kind(8, "Gym", "#2E7D32", "#9BD69B"),
  kind(9, "Work / meetings", "#2A5BD7", "#A3C0FA"),
  kind(10, "Appointments", "#7D5234", "#D8B297"),
  kind(11, "Social / personal", "#5E7114", "#C9D66B"),
]);
