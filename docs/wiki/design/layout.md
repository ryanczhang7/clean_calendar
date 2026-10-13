# Layout and breakpoints — Clean Calendar

_Written 2026-10-12 by the Lead Designer. Tokens from `tokens.md`; components
from `components.md`._

## Breakpoints

| Name | Width | Why this cut | Property |
|---|---|---|---|
| phone | < 600px | Android phones in portrait, and the installed PWA, are 360–430px wide; 600 is where a 7-day week first fits with readable chips | `--bp-tablet: 600px` (the first min-width query) |
| tablet | 600–1023px | landscape phones and small tablets; also a narrow desktop window beside another app | `--bp-desktop: 1024px` |
| desktop | ≥ 1024px | the laptop (brief §2): room for the grid **and** a docked 400px side panel | — |

Media queries are `min-width` and mobile-first: the phone layout is the
base, tablet and desktop add to it. Custom properties cannot be used inside
`@media` conditions, so the two values above are also stated in a comment at
the top of `tokens.css` and in the one place the queries live
(`src/styles/breakpoints.css` — the `@custom-media` names `--tablet` and
`--desktop` if the build supports it, raw px otherwise). Tests assert layout
at 375, 768 and 1280.

There is no "large desktop" breakpoint: above 1440px the grid is centred at
max-width 1440px with `--space-6` gutters.

## What reflows

| Concern | Phone (< 600) | Tablet (600–1023) | Desktop (≥ 1024) |
|---|---|---|---|
| Navigation | top bar (period title, prev/next, sync) + **bottom nav** 56px: Month / Week / Day / Legend / Capture, with a primary **Add** FAB above it | top bar with everything; no bottom nav; FAB for Add | top bar with everything; Add is a top-bar button, Capture a primary top-bar button; no FAB |
| Month grid | 7 columns, cells ≈ 50px wide, 6 rows of 64px; **dots** not chips; a day list under the grid for the selected day (fills the remaining height, scrolls) | 7 columns, up to 3 chips per cell, "+N more" | 7 columns, up to 4 chips per cell, "+N more"; cells grow to fill the viewport height |
| Week view | **3-day** window (selected day ± 1), horizontally swipeable by one day, hour rows 56px, 48px label gutter; the time grid scrolls vertically | 7 days, hour rows 48px | 7 days, hour rows 48px, 56px gutter |
| Day view | one column, hour rows 56px | one column, max-width 720px centred | one column, max-width 720px centred |
| Event sheet | bottom sheet, 92vh, full-screen with keyboard | side panel 400px overlaying with scrim | side panel 400px **docked**, grid shrinks |
| Legend | bottom-nav tab → bottom sheet | top-bar button → popover | top-bar button → popover |
| Kind editor | bottom sheet | dialog 400px | dialog 400px |
| Capture / confirm | full page | full page, max-width 560px centred | capture: page 560px centred; confirm: side panel over the calendar |
| Dialogs | full-width actions stacked, primary on top, 16px side margin | centred, 400px | centred, 400px |
| Toasts | bottom-centre, 16px above the bottom nav, full width minus 32px | bottom-left, 360px | bottom-left, 360px |
| Walkthrough / kinds page | full page, rows 56px, move up/down buttons | centred 560px, drag handles | centred 560px, drag handles |

## Phone specifics

- Everything tappable is **≥ 44×44px** (`--size-touch`): bottom-nav tabs,
  prev/next, the FAB (56px), chip rows in the day list (56px), swatches in
  the kind editor (32px visual inside a 44px hit area), legend rows (48px),
  the "+N" dot summary (the whole cell is the target).
- Month cells themselves are the target (≈ 50×64px). A tap selects the day
  (shows its list); a second tap or a tap on a list row opens the sheet.
  Long-press on a cell is **not** used for anything (no hidden gestures).
- Week view's 3-day window: the top bar title reads "Mon 13 – Wed 15 Oct";
  prev/next move by one day; swiping moves by one day. The selected day is
  the centre column. Today's column keeps the today marker.
- Safe areas: the bottom nav and the bottom sheet pad by
  `env(safe-area-inset-bottom)`; the top bar by `env(safe-area-inset-top)` in
  standalone display mode.
- The time grid's horizontal overflow is never the page's: the page does not
  scroll horizontally at any width ≥ 320px.
- The keyboard: inputs are 16px so Android Chrome does not zoom; the sheet
  uses `100dvh` so it resizes with the keyboard rather than being covered.

## Desktop specifics

- The grid fills the viewport under the top bar; the month grid's six rows
  share the height equally (min row height 96px, then the grid scrolls).
- The side panel docks at 400px and the grid reflows to the remaining width;
  below 1024 + 400 = 1424px of width the week view's day columns get
  narrower rather than the panel overlaying, down to 1024, where it overlays.
- The week view's time grid scrolls inside its own region with the weekday
  header and the all-day row sticky.
- Minimum supported desktop width is the tablet layout; nothing breaks
  between 600 and 1024, it just loses the docked panel.

## Grid maths that tests can pin

- Month view shows exactly 6 rows (42 cells) always, so the grid height does
  not jump between months; weeks start on **Monday** (owner locale; a
  settings story may expose it).
- A timed event's block in week/day view: `top = (minutes since 00:00 /
  60) × --size-hour`, `height = max(duration / 60 × --size-hour, 20px)`;
  a 15-minute event is 20px tall and shows the title only.
- Overlap: events whose intervals intersect share the column width equally in
  start order; a third overlapping event makes three columns. No cascading
  offsets.
- All-day row: height `max(1, min(3, count)) × 24px + 8px`; beyond three, a
  "+N" chip.

## Print

Out of scope for v1; the stylesheet includes a `@media print` that hides the
bottom nav, top-bar buttons and the panel so a month prints sanely, nothing
more.
