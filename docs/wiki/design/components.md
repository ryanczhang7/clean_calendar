# Components — Clean Calendar

_Written 2026-10-12 by the Lead Designer. Each component lists the states it
must support. A state marked "—" with a reason is a decision that the state
does not apply; nothing is left unstated. Tokens are from `tokens.md`;
breakpoints from `layout.md`; keyboard paths and roles are specified in
`accessibility.md` and only summarised here._

The eight states, as used below: **default, hover, focus-visible, active
(pressed), disabled, loading, empty, error.** Hover never carries information
that is unavailable without it: on a phone there is no hover.

## Shared primitives

**Button.** Variants: `primary` (filled `--color-primary`, text
`--color-primary-contrast`), `secondary` (1px `--color-border-strong`, text
`--color-text`), `ghost` (no border, text `--color-text`), `danger`
(ghost with `--color-danger` text; filled danger only inside a confirmation
dialog). Height `--size-control`, padding `0 var(--space-4)`, `--radius-md`,
`--font-size-md`. Hover: background darkens/lightens 8% toward text colour.
Focus-visible: ring per `tokens.md`. Active: 12% toward text colour, no
scale. Disabled: 40% opacity, `aria-disabled="true"` (stays in tab order so a
screen reader can find out why). Loading: label replaced by a 16px spinner
with `aria-busy="true"` and the width held; `aria-label` keeps the verb.
Icon-only buttons are 40×40 (44×44 hit area on phone) with `aria-label`.

**Input / textarea / select.** Height `--size-control`, 1px
`--color-border-strong`, `--radius-md`, `--font-size-md`, visible `<label>`
above (never placeholder-as-label). Hover: border → `--color-text`.
Focus-visible: ring + border `--color-primary`. Disabled: background
`--color-surface-sunken`, text muted. Error: border `--color-danger`, 14px
message below in `--color-danger` with an error icon, linked by
`aria-describedby`, `aria-invalid="true"`. Empty: placeholder in
`--color-text-muted` (6.05:1).

**Toggle (switch).** `role="switch"`, 44×24 track, 20px thumb; on =
`--color-primary` track. Label on the left, clickable. Keyboard: Space toggles.

**Toast.** `--color-surface-raised`, `--shadow-2`, `--radius-md`, 14px text,
optional one action button, 6 s auto-dismiss except toasts with an action
(undo/redo) which stay 10 s and pause on hover/focus. Lives in a
`role="status"` region (`aria-live="polite"`); error toasts use
`role="alert"`. Max one visible; a newer one replaces the older. Position:
bottom-centre on phone above the bottom nav, bottom-left on desktop.

**Dialog.** `<dialog>` element, `--color-surface-raised`, `--shadow-3`,
`--radius-lg`, max-width 400px, title at `--font-size-lg`, body 14–16px,
actions right-aligned (phone: full-width stacked, primary on top). Focus
moves to the first non-destructive control; Escape closes; focus returns to
the opener. Scrim `--color-scrim`.

**Spinner.** 16px or 24px ring in `currentColor`, `aria-hidden`; the host
element carries `aria-busy`. Under reduced motion it stops rotating and shows
a static three-quarter ring.

## App shell and top bar

Height `--size-topbar`, `--color-surface-raised`, bottom 1px `--color-border`
(becomes `--shadow-1` when the grid is scrolled). Contents, desktop, left to
right: app name (links to today), **Today** button, previous/next
(icon-only, labelled "Previous month" / "Next week" etc. by view), the
current period title (`--font-size-lg`, e.g. "October 2026", `<h1>`),
spacer, **view switcher**, **sync status**, **Legend** button, **Capture**
button (primary), avatar menu (Kinds, Notifications, Sign out). Phone: app
name hidden; period title, previous/next and sync status in the top bar;
view switcher, legend, capture and add move to the **bottom nav**
(`layout.md`).

States: default; hover/active on each button as Button; focus-visible ring;
disabled: previous/next never disable (the calendar is unbounded);
loading: on first open before the cache has been read, the period title shows
and the grid shows the skeleton (see Calendar grid); empty and error do not
apply to the bar itself — the grid and the status indicator carry them.

## View switcher

A segmented control, `role="radiogroup"` labelled "View", three radios Month /
Week / Day. Selected: `--color-primary-subtle` background, `--color-primary`
text, `aria-checked="true"`. Keyboard: arrow keys move selection (roving
tabindex), shortcuts `M`, `W`, `D` from anywhere in the grid. Hover: 8% tint.
Disabled, loading, empty, error: do not apply; the control is always usable.

## Calendar grid

Common: the grid is one `role="grid"` with `aria-label` of the period
("October 2026"); day cells are `role="gridcell"` with an accessible name of
the full date plus event count ("Tuesday 14 October, 3 events"). Weekday
headers are `role="columnheader"`, 12px/500 `--color-text-muted`, uppercase
three-letter. Grid lines are 1px `--color-border`. Today's day number sits in
a 24px `--color-today` circle with `--color-primary-contrast` text and
`aria-current="date"`. The selected/focused cell has `--color-selection`
background and the focus ring. Days outside the current month (month view)
use `--color-text-muted` numbers and `--color-surface-sunken` at 50% is
**not** used — keep them on `--color-surface` so chips there keep their
contrast; only the number is muted.

**Month cell.** Day number top-left, chips stacked below, gap `--space-1`.
Density by breakpoint (`layout.md`): desktop shows up to 4 chips then a
"+N more" ghost button (opens the day in Day view); tablet 3; phone shows
**dots** (one 6px dot per event in the kind colour, max 4 then "+") rather
than chips, and a tap opens the day list below the grid. Hover: cell
background `--color-surface-raised`. Active: 12% tint. Focus-visible: ring
inside the cell edge. Empty month: see Empty states. Loading: a skeleton grid
(cells drawn, numbers drawn, chip slots as 60%-opacity `--color-border`
bars; `aria-busy` on the grid). Error: the grid still renders from the cache;
the sync indicator carries the error.

**Week / day time grid.** Hour rows `--size-hour`, hour labels 12px muted in
a 56px gutter, an all-day row at the top (`--color-surface-sunken`) that grows
to fit up to 3 all-day chips then "+N". Columns are `role="gridcell"` per
day-hour; the accessible name is "Tuesday 14 October, 09:00". Overlapping
timed events split the column width equally, 2px gap. Clicking or pressing
Enter on an empty slot creates a 1-hour event starting at that slot. Dragging
on empty slots selects a range (`--color-selection`) and opens the sheet with
that range. Now-line: 2px `--color-now` across today's column with a 8px
circle at the gutter, `aria-hidden`; the grid scrolls on open so now is one
third from the top (day/week showing today) or 08:00 otherwise. Hover on a
slot: `--color-surface-raised`. Loading/empty/error: as the month cell;
an empty week shows no special copy — the time grid is its own affordance.

## Event chip

The unit the brief calls colour-forward. Background = kind colour for the
active theme; text = derived chip text colour (`tokens.md`); `--radius-sm`;
12px/500; padding `2px var(--space-2)`; a 16px leading slot with the kind's
initial. Accessible name: "`<title>`, `<kind>`, `<time or all-day>`,
`<recurring>`, `<has reminder>`" — the markers below are not colour-only
because they are in the name and have glyphs. The chip is a `<button>` (it
opens the sheet); on desktop it is also a drag source (pointer) and resizable
at its bottom edge in week/day view.

| Variant | Visual |
|---|---|
| Timed (month view) | 6px dot in kind colour + "09:00 Title" in `--color-text`; the dot is the colour carrier, text stays grid text so dense months stay readable |
| Timed (week/day) | filled block, title then time on a second line when the block is ≥ 2 rows; one line otherwise |
| All-day | filled chip full width of the cell; in week view it lives in the all-day row and spans days |
| Multi-day | one continuous bar across cells with squared inner corners; the title appears once at the left and again at the start of each new row |
| Recurring | a 12px "repeat" glyph after the title; name includes "repeats weekly" |
| Reminder | a 12px "bell" glyph after the title; name includes "reminder 30 minutes before" |
| Capture origin | a 12px "sparkle" glyph **in the sheet header**, not on the chip (chip space is scarce); the chip's name still ends "captured" so it is discoverable by screen reader |
| Deleted kind | neutral chip, dashed border, `?` initial (`kinds-palette.md`) |

States: default; hover — chip raises to `--shadow-1` and the title shows a
tooltip-free full line (`title` attribute is not used; the sheet is one click
away); focus-visible — double ring (`tokens.md`, Focus); active — 12%
darker; disabled — does not apply, every event is editable (brief §1);
loading — a chip written optimistically shows a 2px dashed outline in its
text colour until the outbox confirms it (name adds "saving"); empty — does
not apply; error — an outbox op refused with 4xx marks the chip with the
danger ring and a "!" badge, and opening it shows the error with Retry /
Discard (`architecture.md`, pending edits). Dragging: the chip follows the
pointer at `--shadow-2`, the source slot shows a dashed ghost; on drop the
sheet does not open — a toast "Moved to Tue 14 Oct, 10:00 · Undo" appears.
Keyboard move: with a chip focused, `Alt+Arrow` nudges by one day (month) or
15 minutes (week/day); `Alt+Shift+Down/Up` resizes by 15 minutes; a toast
confirms each with Undo.

## Event sheet (edit/create)

Desktop (≥ 1024): a **side panel** 400px wide, docked right, pushes the grid
(does not overlay), `--color-surface-raised`, `--shadow-3`, slide-in per
`tokens.md`. Tablet: the same panel overlays the grid with a scrim. Phone:
a **bottom sheet**, 92vh tall, `--radius-lg` top corners, drag handle 32×4,
dismissible by the handle, the Close button, or Escape; full-screen when the
keyboard opens. `role="dialog"`, `aria-labelledby` the title field's label
("New event" / the event title). Focus moves to the Title field on create and
to the Close button on edit; returns to the chip or cell on close.

Header: Close (icon, labelled), title ("New event" / "Edit event"), the
capture-origin sparkle + "Captured from text, 12 Oct" when
`origin = capture`, and a **Delete** button (danger ghost, labelled with the
event title) — visible always, never behind hover or a menu.

Fields, in order (each an Input/Toggle from the primitives, each labelled):

1. **Title** — text, required, 1 line, 120 chars; error "Give the event a
   title."
2. **Kind** — a `<select>`-like **kind picker**: a listbox button showing the
   kind's swatch (16px circle in the current theme colour) and name; opens a
   list of all live kinds, each with swatch + initial + name, plus "Manage
   kinds…" at the bottom. Default for a new event: the last kind used, else
   the first. Deleted kind on an existing event: shown as "Kind removed" with
   the neutral swatch; saving does not require changing it.
3. **All day** — toggle. Switching on hides the time inputs and keeps the
   dates.
4. **Starts / Ends** — date input + time input each (native `type="date"`,
   `type="time"`, 15-minute step), side by side on desktop, stacked on phone.
   Changing Start shifts End to keep the duration. Error: "End must be after
   start." on the End field.
5. **Location** — text, optional, with a "map" glyph; on phone the value is a
   link to `geo:0,0?q=<location>`.
6. **Notes** — textarea, optional, auto-grows to 6 lines.
7. **Repeat** — select: Does not repeat / Daily / Weekly / Yearly; choosing
   one reveals **Ends** — radio: Never / On date (date input). Weekly repeats
   on the start's weekday; yearly on the start's date (both stated in helper
   text, e.g. "Every Tuesday"). Editing an occurrence of a series opens the
   edit-scope dialog first (below).
8. **Reminder** — select: None / At time / 5 / 10 / 15 / 30 min / 1 h / 2 h /
   1 day before. If notification permission has not been granted, choosing
   any value shows the permission prompt inline (below). All-day events
   default the reminder to 09:00 on the day when set to "At time".

Footer: **Save** (primary; disabled only while a required field is empty,
and then its `aria-describedby` says which) and **Cancel** (ghost). Unsaved
changes + close → dialog "Discard changes?" with Keep editing / Discard.

States: default; hover/focus/active per primitive; disabled — Save as above;
loading — Save shows the spinner while the optimistic write lands (≤ 100 ms
normally; the sheet closes on cache write, not on server ack); empty — a
new event is the empty state and needs no copy; error — field errors as
above, and an outbox 4xx surfaces as an `role="alert"` strip at the top of
the sheet with Retry / Discard.

## Kind legend

Always reachable (brief §8). **Desktop:** a **Legend** button in the top bar
toggles a popover (`--shadow-2`, anchored under the button) listing every
live kind: 16px swatch with the initial, name, and a count of events in the
visible period; "Kind removed" last if any such event is visible; a "Manage
kinds" link at the bottom. The popover is `role="dialog"` named "Kind
legend", closes on Escape or outside click, and remembers nothing — it is a
reference, not a filter, in v1. **Phone:** a **Legend** tab in the bottom
nav opens the same list as a bottom sheet. Keyboard: `L` toggles it anywhere
in the grid. Clicking a legend row on desktop focuses the kind editor for
that kind (not a filter). States: default; hover row → `--color-surface`
tint; focus ring on rows; empty — cannot be empty (at least one kind exists
after the walkthrough; if all are deleted the row reads "No kinds. Add one."
with the Add action); loading — not needed, kinds are in the cache before
the grid renders; error — does not apply, it reads from the cache.

## Kinds walkthrough and kind editor

**Walkthrough** (first sign-in, brief §3 step 2): a full-screen page, title
"Your event kinds" at `--font-size-xl`, one line of copy (`voice.md`), then
the kind list — one row per default kind: a drag handle (desktop) / move
up-down buttons (phone), the swatch (shows the current theme's colour; a
small secondary swatch shows the other theme's), the initial, the name, and
an **Edit** button. Below: **Add kind** (secondary) and a primary **Done,
show my calendar** button. Done is enabled while at least one kind exists.
Reopening later from the avatar menu ("Kinds") shows the same page titled
"Event kinds" with a Back button instead of Done.

**Kind editor** — a dialog (desktop) or bottom sheet (phone) per kind:

- **Name** — text input, required, 32 chars, unique (error: "You already have
  a kind called Gym."). A warning (not an error) when another kind shares the
  initial: "Gym and Golf both start with G; chips will show Gy and Go."
- **Colour, light / Colour, dark** — two swatch rows. Each row shows the
  eleven palette defaults as 32px circles (44px hit area on phone;
  `role="radio"` in a radiogroup named "Light theme colour") plus a
  **Custom…** swatch that reveals a hex input (`#RRGGBB`, validated) and a
  native `<input type="color">`. Choosing a light colour auto-proposes the
  dark counterpart from the palette pair (or, for custom, a lightened version
  at relative luminance ≥ 0.42) until the user edits the dark one.
- **Preview** — a live chip in each theme rendered on its real surface
  colour, and a readout line per theme:
  "Text contrast 5.9:1 · Against background 5.9:1" with a check glyph, or in
  `--color-danger` with a cross glyph when text contrast < 4.5:1 (then Save
  is disabled and the message reads "Text would be hard to read. Try a darker
  shade." / "…lighter shade." with a **Fix it** button that moves lightness to
  the nearest passing value). Background contrast < 3:1 is a warning glyph
  and copy, not a block.
- **Delete kind** — danger ghost button at the bottom, labelled "Delete
  Movies". Opens the confirmation dialog: "Delete the kind Movies? N events
  keep their details and show as 'Kind removed'. You can't undo this." with
  Cancel / Delete (filled danger). Deleting a kind is a soft-delete and
  **cannot** be undone from the UI in v1 (the toast is plain, no Undo) — see
  Concerns.
- **Add kind** — the same editor with empty name and the first unused palette
  pair pre-selected.

States: default; hover/focus/active per primitive; disabled — Save while
invalid; loading — Save spinner while the cache write lands; empty — new
kind as above; error — name uniqueness and hex validity inline; a server
refusal as an alert strip.

## Capture screen (`/capture`)

Page title "Capture" (`--font-size-lg`). Two inputs stacked, phone-first:

- **Paste box** — a textarea, label "Booking email or text", 8 lines, grows
  to 20, placeholder from `voice.md`; a **Paste** button beside the label on
  phone (reads the clipboard via `navigator.clipboard.readText()` and falls
  back to focusing the box).
- **Image picker** — a 96px-tall dashed drop zone (`--color-border-strong`,
  `--radius-md`) with "Choose a screenshot" (opens `<input type="file"
  accept="image/*">`); on desktop also a drop target and a paste target for
  image clipboard data. Shows a 96px thumbnail with a Remove button once
  chosen. Only one input (text or image) is sent; if both are present the
  image wins and a note says so.
- Footer: **Propose event** (primary; disabled until one input has content).

States: default; hover/focus per primitive; disabled — the button as above;
**loading ("sharing in…")** — when opened with `?from=share` the page shows
a skeleton of the paste box with the copy "Reading what you shared…" and a
spinner until the inbox payload is read (normally < 300 ms); then the input
appears prefilled. While the proposal request runs, the button is in its
loading state, the inputs are read-only, and a `role="status"` line says
"Asking the assistant… usually takes a few seconds." — plus a **Cancel**
ghost button; empty — the page itself (see Empty states for copy); error —
offline: the button is disabled and an inline notice says capture needs a
connection; a function error shows an alert strip "Couldn't read that. Try
pasting the text instead." with Retry; a too-large image (> 4 MB after
client-side downscale) says so and offers to downscale.

## Confirm screen (`/capture/confirm`)

The event sheet's fields, rendered as a full page (phone) or the side panel
(desktop), titled "Check the details", with the proposal filled in and
**every field editable**. Confidence is shown **per field**, not colour-only:

| Field state | Visual | Accessible |
|---|---|---|
| Confident (≥ 0.8) | plain field | nothing extra |
| Low confidence (< 0.8) | `--color-warning-subtle` field background, a warning glyph in the label, helper text "Not sure about this — check it" | `aria-describedby` the helper |
| Missing (`missing` list) | `--color-warning-subtle` background, warning glyph, helper "Not found in the text — add it", **and the field is focused first** | `aria-describedby`; the `role="status"` summary names them |

On open a `role="status"` line summarises: "Found 4 of 5 details. Check the
kind and add the end time." Focus goes to the first missing field, else the
first low-confidence field, else Title. The kind picker shows the model's
pick; if `null`, the field is Missing. A "Discard" ghost button marks the job
`discarded`; **Save event** (primary) writes with `origin = capture`. After
save: navigate to the event's day in the last-used view, with the new chip
focused and a toast "Added Flight to Tokyo · View". The original input is
shown collapsed below the form ("Show what was captured") so the user can
compare; it is not persisted (`architecture.md`).

States: default; hover/focus/active per primitive; disabled — Save while
Title or Start is empty; loading — Save spinner; empty — a proposal with no
fields found at all shows the form blank with the summary "Couldn't find
event details. Fill them in, or try a clearer screenshot."; error — as the
sheet.

## Sync status indicator

In the top bar, right of the period title on phone, left of Legend on
desktop. A 20px glyph + (desktop only) a 12px label. `role="status"`,
`aria-live="polite"`; the label text is the accessible name on phone too.

| State | Glyph | Label / name | Colour |
|---|---|---|---|
| Online, synced | cloud with check | "Synced" | `--color-success` |
| Pending N | cloud with arrow + badge N | "Syncing 3 changes" | `--color-text-muted` |
| Offline | cloud with slash | "Offline — changes will sync later" | `--color-warning` |
| Error (an op refused) | cloud with ! | "1 change couldn't sync" | `--color-danger` |

Clicking it opens a popover listing pending/failed ops with Retry / Discard
per failed op. **Conflict toast** (`architecture.md`, conflict rule): a
`role="alert"` toast with the copy in `voice.md` and a **Redo** action that
reapplies the dropped patch over the fresh server copy. Hover: tooltip-free;
the label is visible on desktop and in the popover on phone. Loading: the
"Pending" state is the loading state. Empty/error: covered by the rows.

## Notification permission prompt

Never on first open. Shown inline **the first time a reminder is chosen**
(in the sheet) and in Settings → Notifications: a card with copy from
`voice.md`, a primary **Allow notifications** button (calls
`Notification.requestPermission()` on the click, which Chrome requires), and
**Not now**. If the browser answer is `denied`, the card becomes a static
notice telling the user where to re-enable it (site settings) and reminder
fields stay editable (reminders still exist server-side for another device).
On the laptop it adds: "Reminders are only reliable on your phone when the
app is closed." States: default; hover/focus per Button; loading — Allow
shows the spinner while the browser prompt is up; error — the `denied`
notice; disabled and empty do not apply.

## Sign-in screen

Centred card, max-width 360px: app name at `--font-size-xl`, one line of
copy, a single **Sign in with Google** button (secondary style, Google
glyph, full width, 48px tall), and a 12px muted line "One account, yours
only." States: loading — the button spinner while the OAuth redirect starts;
error — if the returned e-mail is not the allowed one, an alert strip "This
calendar belongs to another account. Sign out and try the right one." with a
Sign out button; offline — the button disabled with "Sign-in needs a
connection"; hover/focus per Button; empty and disabled otherwise do not
apply.

## Empty states

- **Empty month** (no events in the visible month) — the grid still renders
  in full. In the centre of the grid, over the cells, a 320px card at
  `--color-surface-raised`, `--shadow-1`: title "Nothing this month" and the
  one action **Capture a booking** (primary) with a secondary text link "or
  add an event". Exact copy in `voice.md`. On phone the card sits below the
  grid in the day-list area. The card disappears the moment one event exists
  in the month; it is not shown while the grid is loading.
- **Empty day list** (phone, a day with no events selected) — one line "No
  events on Tue 14 Oct" and an **Add** ghost button.
- **Empty capture** — the page itself; the paste box placeholder and the
  drop zone are the empty state (copy in `voice.md`).
- **Empty legend / kinds** — "No kinds. Add one." with Add.

## Error states

- **Field errors** — inline under the field, `--color-danger`, glyph, linked
  by `aria-describedby`; focus moves to the first invalid field on submit.
- **Alert strips** — `role="alert"`, `--color-danger-subtle` background,
  `--color-danger` glyph and text, at the top of the sheet/page, with one
  Retry action where retry makes sense.
- **Full-page error** — only for "cache unavailable" (IndexedDB blocked):
  title "Can't open the calendar", one line, a Reload button.
- **Offline** is a status, not an error; the only offline *errors* are the
  actions that need a connection (capture, sign-in), each disabled with an
  inline reason rather than failing on click.

## Undo toast for delete

Deleting an event (sheet's Delete, or `Delete` key on a focused chip) removes
it from the cache immediately and shows a toast "Deleted Dinner at Nopa ·
Undo" for 10 s; Undo restores the row (the outbox op is a soft-delete, so
undo is a patch of `deleted_at = null`). No confirmation dialog for a single
event — the undo is the safety. Deleting a **series** goes through the
edit-scope dialog first, then the same toast ("Deleted Gym and all its
occurrences · Undo"). Keyboard: while the toast is showing, `Ctrl+Z` triggers
Undo.

## Edit-scope dialog

Opens when the user saves an edit to, moves, or deletes an occurrence of a
recurring event. Title "Change which events?" (or "Delete which events?"),
radios: **This event only** (default) / **All events in the series**; Cancel
/ Save (or Delete, filled danger). "This event only" writes an
`event_overrides` row; "All events" writes the series. Helper line under the
second option when the change is a date move: "Moving the whole series moves
every occurrence by the same amount." Focus on the first radio; Escape
cancels. The dialog is not shown for a non-recurring event.

## Concerns for the PO

1. **Deleting a kind has no undo.** The brief lets the owner delete kinds;
   the architecture soft-deletes them so events keep their kind. There is no
   "restore kind" in the data model's stated UI. I have specified a
   confirmation dialog (destructive, not reversible → confirm) rather than an
   undo toast. If the PO prefers symmetry with event delete, the kinds story
   needs a "restore" action and a place to list removed kinds; otherwise the
   confirmation stands.
2. **Drag-to-move and resize are pointer-only by nature.** I have specified
   keyboard equivalents (`Alt+Arrow`, `Alt+Shift+Arrow`) and, more
   importantly, the sheet's date/time fields as the canonical way to move an
   event. Any acceptance criterion written as "the user can drag an event to
   another day" must be paired with "and can change the date from the sheet",
   or the criterion forces a pointer-only path.
3. **"+N more" in a month cell hides events on desktop.** It is standard, but
   the hidden events are unreachable by Tab unless the "+N more" control is
   itself a button, which I have specified. A story that renders the month
   grid must not implement overflow as a scrollable cell.
4. **Clipboard read on phone** (`navigator.clipboard.readText`) requires a
   user gesture and a permission prompt on Android Chrome; the Paste button
   is specified with a fallback (focus the box) so a refusal is not an error.
5. **Confirm screen on desktop as the side panel** means a capture started
   on the laptop opens the calendar behind it. That is intended (compare
   against the month), but it means `/capture/confirm` must render the
   calendar shell too; the routing story should say so.

## PO decisions on the concerns

_Lead PO, 2026-10-12, during `/plan-product`._

1. **Deleting a kind** keeps the confirmation dialog; there is no undo and no
   restore in v1 (CAL-007). Revisit only if the owner asks.
2. **Drag is never the only path.** Every move has the sheet's date/time
   fields and the keyboard (`Alt+Arrow`); range-drag to create and
   edge-drag to resize are cut from v1, the sheet and `Alt+Shift+Arrow` cover
   them (CAL-012, CAL-013).
3. **"+N more" is a button**, never a scrolling cell (CAL-009, AC-5).
4. **Clipboard Paste** keeps the specified fallback; no change.
5. **`/capture/confirm` renders inside the app shell** (CAL-002 registers the
   route inside the shell).
6. **Legend counts cut.** The legend lists kinds only - no per-kind counts
   for the visible period and no "Kind removed" row - because the legend
   lives in the shell and counting would tie it to the calendar's visible
   range (CAL-008). `voice.md` is updated to match.
7. **Reordering kinds is cut from v1**: kinds keep creation order; the drag
   handles and move buttons in the walkthrough are not built (CAL-007).
