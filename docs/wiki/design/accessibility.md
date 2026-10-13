# Accessibility floor — Clean Calendar

_Written 2026-10-12 by the Lead Designer. This is the floor every user-facing
story is measured against, specific to this product; the generic floor is the
`design-system` skill's reference. Tests assert it (last section)._

## Contrast

- Body and chip text **≥ 4.5:1**; large text (≥ 24px regular or ≥ 19px bold)
  and the boundary of every interactive control **≥ 3:1**. Values for the
  chrome are tabulated in `tokens.md`; every default kind colour and its
  derived text colour in both themes in `kinds-palette.md` (minimum 4.99:1).
- **Chip text is derived, never stored** (`tokens.md`, "Chip text rule"), so a
  user-chosen kind colour always gets the better of `#1B1B1F` and `#FFFFFF`;
  the kind editor refuses to save a colour where even the better one is
  < 4.5:1. This is the mechanism that guarantees the floor against content the
  product does not author — test the mechanism (`domain/colour`), not a
  screenshot.
- Muted text (`--color-text-muted`) is used only for secondary text that is
  also conveyed elsewhere or is not required to operate the product (weekday
  headers are still 6.05:1).
- Grid lines (`--color-border`) are decorative and exempt; control boundaries
  use `--color-border-strong` (4.56:1 light, 5.7:1 dark).

## Focus

- Every interactive element shows the `:focus-visible` ring from `tokens.md`
  (2px `--color-focus`, 2px offset; doubled with a surface-colour gap on
  chips, swatches and filled buttons so it is ≥ 3:1 against whatever it sits
  on).
- Focus order follows visual order: top bar left to right, then the grid,
  then the open panel/sheet. The bottom nav on phone comes **after** the grid
  in DOM order (it is visually last).
- Focus is trapped only inside an open dialog, bottom sheet or the overlaying
  side panel (tablet); the docked desktop side panel does **not** trap —
  Tab moves from the panel back to the grid. On close, focus returns to the
  element that opened it (the chip, the cell, the button).
- After a route change (view switch, capture → confirm → calendar) focus
  moves to the new page's `<h1>` or, after saving a capture, to the new chip.

## Keyboard paths

The grid is a `role="grid"` with roving `tabindex`: one cell is tabbable, the
rest reachable by arrows. From anywhere in the app:

| Key | Action |
|---|---|
| `T` | go to today |
| `M` / `W` / `D` | switch view |
| `N` | new event on the focused day (or now, if none) — opens the sheet with Title focused |
| `C` | open capture |
| `L` | toggle the legend |
| `?` | show the shortcut list (a dialog) |
| `Escape` | close the topmost sheet/dialog/popover/legend |
| `Ctrl+Z` | Undo, while an undo toast is showing |

In the month grid (cell focused):

| Key | Action |
|---|---|
| `←` `→` | previous / next day |
| `↑` `↓` | same weekday, previous / next week |
| `Home` / `End` | first / last day of the row (Monday / Sunday) |
| `PageUp` / `PageDown` | previous / next month, keeping the day-of-month where possible |
| `Enter` or `Space` | open the day: on phone, show its list; on desktop, open Day view **if the cell has events**, else open the new-event sheet for that day |
| `Tab` | leaves the grid (chips inside the focused cell are reached with `Enter` then arrows in the day list/sheet, not by Tab — one tab stop for the whole grid) |

In the week/day time grid (slot focused):

| Key | Action |
|---|---|
| `↑` `↓` | previous / next 30-minute slot |
| `←` `→` | same time, previous / next day |
| `Enter` | new 1-hour event at the slot |
| `Shift+↓` while on a slot | extend the selected range by 30 min; `Enter` creates with that range |

With a chip focused (chips are buttons reached by arrowing within a cell's
day list, or with `Tab` once the cell's list is open):

| Key | Action |
|---|---|
| `Enter` / `Space` | open the event sheet |
| `Delete` / `Backspace` | delete (undo toast; series → edit-scope dialog) |
| `Alt+←/→/↑/↓` | move by one day (month) or 15 minutes / one day (week/day) |
| `Alt+Shift+↓/↑` | lengthen / shorten by 15 minutes |

Everything a pointer can do — move, resize, create by dragging a range — has a
keyboard path above or a field in the sheet. No action exists only on hover,
long-press or drag.

## Roles and names

| Element | Role | Accessible name |
|---|---|---|
| Period grid | `grid`, `aria-label` | "October 2026" / "Week of 13 October 2026" / "Tuesday 14 October 2026" |
| Weekday header | `columnheader` | "Monday" (visible "MON") |
| Day cell | `gridcell`, `aria-selected` on the focused day, `aria-current="date"` on today | "Tuesday 14 October, 3 events" (0 → "no events") |
| Time slot | `gridcell` | "Tuesday 14 October, 09:00" |
| Event chip | `button` | "Flight to Tokyo, Flights, 09:00 to 11:30" + ", repeats weekly" + ", reminder 30 minutes before" + ", captured" + ", saving" / ", not synced" as applicable; deleted kind → ", kind removed" |
| "+N more" | `button` | "2 more events on Tuesday 14 October" |
| Now line | none (`aria-hidden`) | the current time is available from the clock, not the grid |
| View switcher | `radiogroup` "View"; radios "Month", "Week", "Day" | |
| Sync status | `status` | the label text in `components.md` |
| Legend | `dialog` "Kind legend"; rows are `listitem` | "Movies, 4 events this month" |
| Kind swatch (editor) | `radio` in `radiogroup` "Light theme colour" / "Dark theme colour" | "Purple" (a plain-language name per palette default; custom → the hex) |
| Event sheet | `dialog`, `aria-labelledby` | "New event" / "Edit event: Flight to Tokyo" |
| Edit-scope dialog | `alertdialog` | "Change which events?" |
| Toast region | `status` (`polite`); error/conflict toasts `alert` | the toast text |
| Capture result summary | `status` | "Found 4 of 5 details. …" |
| Icon-only buttons | `button`, `aria-label` | "Previous month", "Close", "Delete Flight to Tokyo", "Remove screenshot" |

Colour is never the only carrier: kind → initial letter + name in the
accessible name; recurring/reminder → glyphs + name; confidence on the
confirm screen → glyph + helper text + focus order + status summary; sync
state → glyph + label; deleted kind → dashed border + `?`.

## Live regions

- One `role="status"` region for toasts and sync-state changes (polite).
- `role="alert"` for: conflict toast, failed-sync toast, alert strips in the
  sheet/capture/sign-in, the full-page error.
- The capture flow announces: "Reading what you shared…" (status), "Asking
  the assistant…" (status), then the confirm summary (status). The keyboard
  move/resize toasts announce the new time (status).
- Form validation errors are linked with `aria-describedby` and
  `aria-invalid`; on submit, focus moves to the first invalid field, which is
  the announcement.

## Targets

- Phone: **44×44px** minimum for everything tapped (`--size-touch`); the
  month cell, legend row, list row and bottom-nav tab are each a single
  target of that size or larger.
- Desktop: 24×24px minimum; buttons are 40px tall; chips in the month grid
  are 20px tall but their hit area is padded to 24px with no visual change.

## Motion

`prefers-reduced-motion: reduce` removes every transform transition and sets
`--duration-base` and `--duration-slow` to 0 (`tokens.md`). Spinners become
static. There is no autoplaying or looping motion anywhere in the product.

## Zoom and text

The layout works at 200% browser zoom (effectively the phone layout on a
laptop) and at 320px viewport width without horizontal scrolling. Nothing
sets `user-scalable=no`. All sizes are px in tokens but text sizes are
applied with `rem` in components (`--font-size-md` → `1rem`) so a user font
size preference scales the type.

## What tests assert

Component tests (Vitest + Testing Library):

- **Query by role and name only.** `getByRole('gridcell', {name: /Tuesday 14 October/})`,
  `getByRole('button', {name: /Flight to Tokyo, Flights/})`. A test that
  reaches for a test-id for a control the user can see is a design smell.
- **Keyboard paths directly.** `user.keyboard('{ArrowRight}')` from the focused
  cell and assert the new cell has focus and `aria-selected`; `N` opens the
  sheet with the Title input focused; `Escape` returns focus to the cell;
  `Delete` on a chip removes it and the toast with name "Undo" exists.
- **Chip text derivation.** `domain/colour`: for every default in
  `kinds-palette.md`, in both themes, the chosen text colour's contrast
  ≥ 4.5; for a fixed set of pathological hexes (`#808080`, `#7F7F7F`,
  `#FFFF00`, `#000080`) the function picks the higher one and reports the
  ratio to two decimals; the kind editor disables Save when it is < 4.5.
- **Tokens exist.** `src/styles/tokens.css` declares every property named in
  `tokens.md` on `:root`, and the dark block declares every `--color-*`
  (a test parses the file and diffs the two lists).
- **Names carry the markers.** A recurring event's chip name includes
  "repeats"; a captured event's includes "captured"; a deleted-kind event's
  includes "kind removed".
- **Live regions.** After a save, the status region contains the toast text;
  after a conflict, an element with `role="alert"` contains "edited elsewhere".

Integration (Playwright, the `integration` gate):

- **axe** (`@axe-core/playwright`) on: sign-in, walkthrough, month view with
  events in all eleven kinds in both colour schemes (`page.emulateMedia({colorScheme})`),
  week view with the sheet open, capture, confirm with a missing field, the
  edit-scope dialog. Zero violations at `wcag2a`, `wcag2aa`, `wcag21aa`.
- **Narrow viewport**: at 375×812 the page has no horizontal scroll, every
  bottom-nav tab's bounding box is ≥ 44×44, and the sheet opens as a bottom
  sheet.
- **Reduced motion**: with `reducedMotion: 'reduce'` the sheet's computed
  `transition-duration` is `0s`.
- **Focus return**: open a chip, Escape, expect `document.activeElement` to be
  that chip.
