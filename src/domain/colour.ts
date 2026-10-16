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

// CAL-007, Contract Block 1: the editor's floors, and the two lightness walks
// behind "Fix it" and the proposed dark counterpart of a custom colour.

export const SURFACE_LIGHT = "#FFFFFF"; // tokens.css --color-surface, light
export const SURFACE_DARK = "#121417"; // tokens.css --color-surface, dark
export const TEXT_FLOOR = 4.5; // accessibility.md, Contrast
export const SURFACE_FLOOR = 3; // kinds-palette.md, ">= 3:1 against its theme's surface"

/** Hue in degrees and saturation 0..1 at full precision; lightness 0..1. */
type Hsl = { h: number; s: number; l: number };

function toHsl(hex: string): Hsl {
  relativeLuminance(hex); // validates the input
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** HSL back to `#RRGGBB`: each channel rounded, upper case. */
function fromHsl({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(h / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector] as [number, number, number];
  const channel = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/**
 * Steps from `hex`'s lightness (an integer percentage) by `step` points at a
 * time until `passes`, keeping hue and saturation. Null at the 0/100 clamp.
 */
function walk(
  hex: string,
  step: 1 | -1,
  passes: (candidate: string) => boolean,
): { hex: string; steps: number } | null {
  const hsl = toHsl(hex);
  const start = Math.round(hsl.l * 100);
  for (let lightness = start + step, steps = 1; ; lightness += step, steps++) {
    if (lightness < 0 || lightness > 100) return null;
    const candidate = fromHsl({ ...hsl, l: lightness / 100 });
    if (passes(candidate)) return { hex: candidate, steps };
  }
}

const textPasses = (hex: string) => chipText(hex).ratio >= TEXT_FLOOR;

/** The nearest lightness that passes TEXT_FLOOR, or null when `hex` already passes. */
export function nearestPassing(
  hex: string,
): { hex: string; direction: "darker" | "lighter" } | null {
  if (textPasses(hex)) return null;
  const darker = walk(hex, -1, textPasses);
  const lighter = walk(hex, 1, textPasses);
  // A tie goes to darker; a direction that hit the clamp is out of the race.
  if (darker !== null && (lighter === null || darker.steps <= lighter.steps)) {
    return { hex: darker.hex, direction: "darker" };
  }
  // Black passes against white text and white against dark text, so at
  // least one direction always arrives.
  return { hex: (lighter as { hex: string }).hex, direction: "lighter" };
}

/** A lightened `hex` for the dark theme: the first lightness step at relative luminance >= 0.42. */
export function darkCounterpart(hex: string): string {
  const bright = (candidate: string) => relativeLuminance(candidate) >= 0.42;
  if (bright(hex)) return hex;
  // White is at luminance 1, so the upward walk always arrives.
  return (walk(hex, 1, bright) as { hex: string }).hex;
}
