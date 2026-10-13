# Design tokens — Clean Calendar

_Written 2026-10-12 by the Lead Designer. Altitude: true for months. The first
UI story (CAL-002) emits these as real CSS custom properties in
`src/styles/tokens.css`, under exactly the names below; tests assert the names.
Change a value here and in the stylesheet together; never add a token to the
stylesheet that this file does not name._

## Principles

1. **Chrome is neutral; kinds carry the colour.** Every token in this file is
   grey, near-black, near-white, or the one accent `--color-primary`. The
   kind colours live in `kinds-palette.md` and in the database, not here.
2. **Names are roles, never appearances.** `--color-danger`, not `--color-red`.
3. **Light is the default; dark overrides.** Every colour role is defined on
   `:root`; the dark block redefines only colours. A token defined only inside
   the dark block is a bug.
4. **Every value is a number with a unit.** px for size and space, ms for time.

## Theme mechanism

Three theme states exist: **system** (default), **light**, **dark**.

- **v1 ships system only.** The stylesheet defines light values on `:root`
  and dark values under `@media (prefers-color-scheme: dark)`. `:root` also
  sets `color-scheme: light dark` so native controls (date/time inputs,
  scrollbars) follow.
- **Explicit choice is a later story**, not v1. The hook is reserved now so
  it costs nothing then: the dark block is written as
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`
  and the same declarations are repeated under `:root[data-theme="dark"]`.
  Until that story exists nothing sets `data-theme`, and
  `architecture.md` already names `localStorage` as where the choice persists.
- The active theme decides which kind colour the chip uses:
  `kinds.color_light` under light, `kinds.color_dark` under dark
  (`architecture.md`, "Colour").

## Colour roles

| Role | Property | Light | Dark | Used for |
|---|---|---|---|---|
| Surface | `--color-surface` | `#FFFFFF` | `#121417` | page background, month cells, sheet body |
| Surface, raised | `--color-surface-raised` | `#F6F7F9` | `#1C1F24` | top bar, side panel, cards, menus, toasts |
| Surface, sunken | `--color-surface-sunken` | `#EEF0F3` | `#0B0D10` | week-view all-day row, disabled inputs, past days (optional) |
| Text | `--color-text` | `#1B1B1F` | `#E8EAED` | body, titles, day numbers |
| Text, muted | `--color-text-muted` | `#5F6368` | `#A8ADB5` | weekday headers, hour labels, helper text, placeholders |
| Border | `--color-border` | `#D9DBE0` | `#33373D` | grid lines, dividers (decorative, not a control boundary) |
| Border, strong | `--color-border-strong` | `#747880` | `#8A8F98` | input and button boundaries (≥ 3:1 against surface) |
| Primary | `--color-primary` | `#1A5FD0` | `#8FB4FF` | primary button, links, today marker, selection accent, now-line |
| Primary contrast | `--color-primary-contrast` | `#FFFFFF` | `#121417` | text and icons on `--color-primary` |
| Primary, subtle | `--color-primary-subtle` | `#DCE7FB` | `#23324F` | selected day background, pressed primary-ghost |
| Danger | `--color-danger` | `#B3261E` | `#F2A49E` | delete button text/border, error text, error icon |
| Danger contrast | `--color-danger-contrast` | `#FFFFFF` | `#121417` | text on a filled danger button |
| Danger, subtle | `--color-danger-subtle` | `#FBE4E2` | `#3A1F1D` | error field background, conflict toast tint |
| Warning | `--color-warning` | `#8A5A00` | `#F0C36A` | low-confidence field marker, offline/pending status |
| Warning, subtle | `--color-warning-subtle` | `#FFF1D6` | `#3A2E12` | low-confidence / missing field background on the confirm screen |
| Success | `--color-success` | `#1E6B2E` | `#86D59A` | synced status, "saved" toast icon |
| Focus ring | `--color-focus` | `#1A5FD0` | `#8FB4FF` | `:focus-visible` outline; see Focus below |
| Chip, neutral | `--color-chip-neutral` | `#6E6E73` | `#B9B9C0` | chip background for an event whose kind was deleted |
| Chip text, dark | `--color-chip-text-dark` | `#1B1B1F` | `#1B1B1F` | text on a light chip colour (same in both themes) |
| Chip text, light | `--color-chip-text-light` | `#FFFFFF` | `#FFFFFF` | text on a dark chip colour (same in both themes) |
| Today marker | `--color-today` | `#1A5FD0` | `#8FB4FF` | the filled circle behind today's day number; text on it is `--color-primary-contrast` |
| Selection | `--color-selection` | `#DCE7FB` | `#23324F` | the focused/selected day cell and the selected time range while dragging |
| Now line | `--color-now` | `#D93025` | `#FF8A80` | the current-time rule in week/day view (distinct from primary so it reads at a glance) |
| Scrim | `--color-scrim` | `rgba(0, 0, 0, 0.40)` | `rgba(0, 0, 0, 0.60)` | behind bottom sheets and dialogs |

Contrast of the roles that carry text, computed with the WCAG 2.x formula
(relative luminance, `(L1 + 0.05) / (L2 + 0.05)`):

| Pair | Light | Dark |
|---|---|---|
| text on surface | 17.17 | 15.31 |
| text-muted on surface | 6.05 | 8.18 |
| text-muted on surface-raised | 5.6 | 7.33 |
| primary on surface (links, today number) | 5.85 | 8.91 |
| primary-contrast on primary | 5.85 | 8.91 |
| danger on surface | 6.54 | 9.30 |
| warning on surface | 5.93 | 11.18 |
| success on surface | 6.57 | 10.54 |
| border-strong on surface | 4.56 | 5.7 |
| focus on surface | 5.85 | 8.91 |
| chip-text-light on chip-neutral | 5.07 | — |
| chip-text-dark on chip-neutral | — | 8.80 |

**Chip text rule.** A chip's text colour is not stored; it is chosen by
`domain/colour` at render time: whichever of `--color-chip-text-dark` and
`--color-chip-text-light` has the higher contrast against the chip's
background. This is what keeps a user-picked hex readable; the kind editor shows
the resulting ratio live (`components.md`, Kind editor). The eleven defaults
and their ratios are in `kinds-palette.md`.

## Typography

Font: the system UI stack —
`--font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
Numerals in the grid use `font-variant-numeric: tabular-nums` so day numbers
and hour labels align.

| Step | Property (size / line-height / weight) | Values | Used for |
|---|---|---|---|
| xs | `--font-size-xs` / `--line-height-xs` / `--font-weight-medium` | 12px / 16px / 500 | chip text, weekday headers, hour labels, badges |
| sm | `--font-size-sm` / `--line-height-sm` / `--font-weight-regular` | 14px / 20px / 400 | secondary body, helper text, toast body, legend labels |
| md | `--font-size-md` / `--line-height-md` / `--font-weight-regular` | 16px / 24px / 400 | body, form inputs (16px prevents Android zoom-on-focus), buttons |
| lg | `--font-size-lg` / `--line-height-lg` / `--font-weight-semibold` | 20px / 28px / 600 | sheet and dialog titles, month name in the top bar |
| xl | `--font-size-xl` / `--line-height-xl` / `--font-weight-semibold` | 28px / 36px / 600 | walkthrough heading, day-view day number, sign-in heading |

Weights: `--font-weight-regular: 400`, `--font-weight-medium: 500`,
`--font-weight-semibold: 600`. No other weights.

Chip text at 12px/500 is **not** "large text" under WCAG, so chips are held to
4.5:1, not 3:1.

## Spacing

4px base. One ramp, used for padding, gaps and margins alike.

| Property | Value |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 24px |
| `--space-6` | 32px |
| `--space-7` | 48px |
| `--space-8` | 64px |

Two sizes that are layout facts rather than rhythm:

| Property | Value | Meaning |
|---|---|---|
| `--size-touch` | 44px | minimum hit area for anything tapped on a phone |
| `--size-control` | 40px | default height of buttons and inputs on desktop; on phone the hit area is padded to `--size-touch` |
| `--size-topbar` | 56px | top bar height, all breakpoints |
| `--size-bottomnav` | 56px | bottom navigation height on phone |
| `--size-hour` | 48px | height of one hour row in the week/day time grid (desktop); 56px on phone for touch |

## Radii

| Property | Value | Used for |
|---|---|---|
| `--radius-sm` | 4px | event chips, badges, tags |
| `--radius-md` | 8px | buttons, inputs, cards, menus, toasts |
| `--radius-lg` | 16px | bottom sheets (top corners), dialogs, side panel (inner corners) |
| `--radius-full` | 9999px | today marker, avatar, colour swatches, FAB |

## Elevation

Three levels. In dark mode shadows are nearly invisible against `#121417`, so
each raised layer also uses a lighter surface (`--color-surface-raised`), and
levels 2–3 add a 1px `--color-border` outline.

| Property | Light | Dark | Used for |
|---|---|---|---|
| `--shadow-1` | `0 1px 2px rgba(0,0,0,0.12)` | `0 1px 2px rgba(0,0,0,0.6)` | cards, top bar on scroll |
| `--shadow-2` | `0 4px 12px rgba(0,0,0,0.16)` | `0 4px 12px rgba(0,0,0,0.7)` | menus, popovers, toasts, dragged chip |
| `--shadow-3` | `0 12px 32px rgba(0,0,0,0.24)` | `0 12px 32px rgba(0,0,0,0.8)` | bottom sheet, dialog, desktop side panel |

Z-order, as tokens so stories do not invent numbers:
`--z-grid: 0`, `--z-nowline: 1`, `--z-chip-drag: 10`, `--z-topbar: 20`,
`--z-panel: 30`, `--z-scrim: 40`, `--z-sheet: 50`, `--z-toast: 60`,
`--z-dialog: 70`.

## Motion

| Property | Value | Used for |
|---|---|---|
| `--duration-fast` | 100ms | hover/press colour changes, focus ring appearing |
| `--duration-base` | 180ms | chip move/resize settle, menu open, toast in |
| `--duration-slow` | 280ms | bottom sheet and side panel slide, view switch cross-fade, dialog |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | anything entering or moving |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | anything leaving |

What animates, and only this:

- Bottom sheet: `transform: translateY(100%) → 0`, slow/standard; leaves with exit.
- Side panel (desktop): `transform: translateX(100%) → 0`, slow/standard.
- Dialog: opacity 0 → 1 and `scale(0.96) → 1`, base/standard.
- Toast: `translateY(8px)` + opacity, base/standard.
- Month/week/day switch and month paging: opacity cross-fade, base. No slide.
- A chip being dragged: follows the pointer with no transition; on drop it
  settles into its slot over `--duration-base`.
- The now-line does not animate; it is repositioned once a minute.

**Reduced motion.** Under `@media (prefers-reduced-motion: reduce)` the
stylesheet sets `--duration-base: 0ms` and `--duration-slow: 0ms`, and every
`transform` transition is removed (sheets, panels, dialogs, toasts appear in
place). `--duration-fast` opacity and colour changes may remain. Nothing in the
product loops or autoplays, so there is nothing further to pause.

## Focus

One rule everywhere: `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }`.
On an element whose own background could be close to the ring colour (a chip,
a colour swatch, the primary button) the ring is doubled —
`box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-focus)` —
so the ring always sits against the page surface, where its contrast is
5.85:1 (light) and 8.91:1 (dark). Never `outline: none` without the
replacement.

## Iconography

Outline icons, 20px in chrome, 16px inside chips, 1.75px stroke, drawn in
`currentColor`. Every icon-only control has an `aria-label`; decorative icons
carry `aria-hidden="true"`. The kind "icon" on a chip in v1 is the kind's
initial letter (see `kinds-palette.md`); real glyphs per kind are a later
story and would reuse the same 16px slot.
