# Voice — Clean Calendar

_Written 2026-10-12 by the Lead Designer. Short on purpose: one user, and the
copy below is the copy, not a style to interpret. When a story needs a string
that is not here, write it in this voice and add it here._

## Tone

Plain, brief, second person, present tense. The app talks the way a
competent assistant would in a one-line note: says what happened, says what
to do next, and stops. No exclamation marks, no "Oops", no "Awesome". Never
blames the user ("invalid input"); says what the app needs ("Give the event
a title."). Sentences end with a full stop; button labels do not. Title Case
is not used — only the first word of a label or title is capitalised.

## Naming

| Say | Not | Why |
|---|---|---|
| **kind** | category, type, tag, label, colour | the brief's word; a kind is a named colour, and "colour" would make the colour the thing instead of the kind |
| **capture** | import, scan, AI, parse | the brief's word; it is what the user does, not what the model does |
| **the assistant** | Gemini, the AI, the model | the capture screen names the thing that reads the text without naming a vendor the owner may swap |
| **event** | appointment, entry, item | "Appointments" is a kind |
| **series** / **this event only** | recurring instance, occurrence | what the user sees; "occurrence" is a code word |
| **reminder** | notification, alert | a reminder is the thing set on the event; "notification" is only used for the browser permission |
| **sync** / **synced** / **couldn't sync** | upload, push, save to cloud | |
| **Kind removed** | deleted kind, unknown kind, (none) | what the neutral chip's legend row and sheet field say |
| **Today**, **Month**, **Week**, **Day**, **Legend**, **Capture**, **Add** | | the fixed names of the navigation controls |

Dates and times follow the device locale; relative words are limited to
"today", "tomorrow" and "yesterday" in toasts and summaries.

## Error-message style

`<what happened>. <what to do>.` — two short sentences, the second one
actionable, no codes. Examples:

- "Give the event a title."
- "End must be after start."
- "Couldn't save. Try again." (the event sheet, when a write is refused; CAL-012)
- "You already have a kind called Gym."
- "Text would be hard to read. Try a darker shade."
- "Couldn't read that. Try pasting the text instead."
- "1 change couldn't sync. Retry or discard it."
- "Capture needs a connection. Your other changes are saved and will sync."
- "This calendar belongs to another account. Sign out and try the right one."
- "Can't open the calendar. Reload to try again."

## Fixed copy

**Sign-in screen**

- Heading: "Clean Calendar"
- Line: "Your calendar, with every event coloured by what it is."
- Button: "Sign in with Google"
- Footnote: "One account, yours only."

**Kinds walkthrough**

- Title: "Your event kinds"
- Line: "Every event gets a kind, and the kind decides its colour. Rename,
  recolour or remove these, or add your own. You can change them later."
- Buttons: "Add kind", "Done, show my calendar"

**Empty month** (card over the grid)

- Title: "Nothing this month"
- Line: "Share a booking email to the app, or paste it here, and it becomes
  an event."
- Primary action: "Capture a booking"
- Secondary link: "or add an event"

**Empty day list** (phone): "No events on Tue 14 Oct" · button "Add"

**Capture screen**

- Title: "Capture"
- Paste box label: "Booking email or text"
- Paste box placeholder: "Paste the confirmation email, or any text with a
  date in it."
- Drop zone: "Choose a screenshot" · desktop adds "or drop one here"
- Button: "Propose event"
- Sharing in: "Reading what you shared…"
- Working: "Asking the assistant… usually takes a few seconds."
- Offline: "Capture needs a connection. Your other changes are saved and
  will sync."

**Confirm screen**

- Title: "Check the details"
- Summary: "Found {n} of {total} details." + when applicable " Check {low
  fields} and add {missing fields}." e.g. "Found 4 of 5 details. Check the
  kind and add the end time."
- Low-confidence helper: "Not sure about this — check it"
- Missing helper: "Not found in the text — add it"
- Nothing found: "Couldn't find event details. Fill them in, or try a clearer
  screenshot."
- Buttons: "Save event", "Discard"
- Collapsed source: "Show what was captured" / "Hide what was captured"
- After save (toast): "Added {title} · View"

**Notification permission**

- Title: "Get reminders on this device"
- Line: "Allow notifications so reminders can reach you when the app is
  closed."
- Laptop addendum: "Reminders are only reliable on your phone when the app is
  closed."
- Buttons: "Allow notifications", "Not now"
- Denied: "Notifications are blocked for this site. Turn them on in your
  browser's site settings to get reminders here."

**Sync status** (labels): "Synced" · "Syncing {n} changes" ("Syncing 1
change") · "Offline — changes will sync later" · "{n} changes couldn't sync"

**Toasts**

| Event | Copy | Action |
|---|---|---|
| Delete event | "Deleted {title}" | Undo |
| Delete series | "Deleted {title} and all its occurrences" | Undo |
| Move (drag or keyboard) | "Moved to {Tue 14 Oct, 10:00}" | Undo |
| Resize | "Now ends at {11:30}" | Undo |
| Conflict (server copy newer) | "Edited elsewhere; your change to {field} was not applied." | Redo |
| Sync failed (4xx) | "{title} couldn't sync." | Retry |
| Back online, drained | "Back online. {n} changes synced." ("Back online. 1 change synced.") | — |
| Kind deleted | "Deleted the kind {name}. Its events now show as Kind removed." | — |
| Capture saved | "Added {title}" | View |
| New version (service worker updated) | "A new version is ready." | Reload |

The `{field}` in the conflict toast is the plain field name: "title",
"start time", "end time", "all day", "location", "notes", "kind", "repeat",
"reminder"; for a kind: "name", "colour", "order" (CAL-015 PO decision 8).
Several fields: "your changes to title and location were not applied."; three
or more: "title, start time and notes".

**Dialogs**

- Edit scope: "Change which events?" / "Delete which events?" — "This event
  only" / "All events in the series" — Cancel / Save (Delete)
- Discard changes: "Discard changes?" — "You've edited this event." — "Keep
  editing" / "Discard"
- Delete kind: "Delete the kind {name}?" — "{n} events keep their details
  and show as Kind removed. You can't undo this." — Cancel / Delete
- Shortcuts (`?`): "Keyboard shortcuts" — the table in `accessibility.md`

**Event form**: "The series must end after it starts." (Repeat, Ends on date)

**Not found** (unknown route): heading "Nothing here" · link "Go to today"

**Legend**: title "Kind legend" · row "{name}" · link "Manage kinds" ·
empty "No kinds. Add one." with "Add". (Per-kind counts and the "Kind removed"
row are cut from v1 by the PO, 2026-10-12; see `components.md`, PO decisions.)

## Concerns for the PO

- The conflict toast's copy is quoted from `architecture.md` and kept
  verbatim so the test for the conflict rule and the UI agree; if the PO
  rewords one, reword both.
- "Done, show my calendar" is the one button label with a comma; it is
  deliberate (the owner chose the walkthrough over landing on the calendar,
  so the button names the reward). A story may shorten it to "Show my
  calendar" if it wraps at 360px — both are acceptable; record which.
