// The chip text rule (CAL-006, AC-2; tokens.md "Chip text rule";
// accessibility.md, Contrast). A chip's text colour is derived, never stored:
// whichever of the two candidates has the higher WCAG 2.x contrast against
// the chip colour. Full precision throughout; only `chipText` rounds.

export const CHIP_TEXT_DARK = "#1B1B1F";
export const CHIP_TEXT_LIGHT = "#FFFFFF";
export type ChipText = typeof CHIP_TEXT_DARK | typeof CHIP_TEXT_LIGHT;

const HEX = /^#[0-9A-Fa-f]{6}$/;

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#RRGGBB` colour, 0..1. */
export function relativeLuminance(hex: string): number {
  if (!HEX.test(hex)) {
    throw new RangeError(`not a #RRGGBB colour: "${hex}"`);
  }
  const r = linear(Number.parseInt(hex.slice(1, 3), 16));
  const g = linear(Number.parseInt(hex.slice(3, 5), 16));
  const b = linear(Number.parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** (Lmax + 0.05) / (Lmin + 0.05): symmetric, unrounded, always >= 1. */
export function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The chip text colour with the higher contrast, and that ratio rounded to 2 dp. */
export function chipText(hex: string): { text: ChipText; ratio: number } {
  const dark = contrast(hex, CHIP_TEXT_DARK);
  const light = contrast(hex, CHIP_TEXT_LIGHT);
  // A tie at full precision picks the dark text.
  const text: ChipText = light > dark ? CHIP_TEXT_LIGHT : CHIP_TEXT_DARK;
  const ratio = text === CHIP_TEXT_LIGHT ? light : dark;
  return { text, ratio: Math.round(ratio * 100) / 100 };
}
