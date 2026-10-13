# Product brief — Clean Calendar

_Written 2026-10-12 from an interview with the owner (Ryan). Single-user
product. Edit this file and re-run `/plan-product` when requirements change._

## Summary

A personal calendar that works the way Google Calendar should: every event has
a **kind** (flight, hotel, restaurant, movie, birthday, gym, work…) and the
kind decides its colour; any event, however it was created, is fully editable;
and a booking email becomes an event by sharing a screenshot or its text to the
app, where an LLM extracts the details for confirmation. It runs as a web app on
a laptop and as an installable PWA on Android, with one account (Sign in with
Google) syncing the same data to both, recurring events and phone reminders.
Hosting stays near $0/month; the only per-use cost is the LLM call per capture.

## 1. Problem

Google Calendar is the owner's current calendar and is mostly fine, except for
two things that happen every time a booking arrives by email:

- **Events auto-created from Gmail are always yellow.** Colour should mean
  *what kind of thing this is* — a flight should not look like a dinner
  reservation. There is no way to set a default colour per kind.
- **Auto-created events cannot be edited.** To fix a detail the owner has to
  duplicate the event and delete the original.

Today the owner either lives with yellow, uneditable events, or re-types them.
The product removes both: colour is derived from kind, with sensible defaults,
and there is no such thing as a non-editable event.

A direct Gmail connection would make capture automatic, but it is not required
for v1 — the owner is happy to send the app a screenshot or the copied text.

## 2. Users

One user: the owner, on a Windows laptop (browser) and an Android phone. They
use Google Calendar daily and like its views and editing model; they are a
developer and comfortable supplying an API key. No other users in v1; no
sharing, no permissions, no onboarding for strangers.

## 3. The first five minutes

Fresh phone or laptop:

1. Open the app → **Sign in with Google** (one account).
2. **Set up event kinds** — a short walkthrough showing the default kind list
   with its colours, where the owner can rename, recolour, delete or add kinds
   before seeing the calendar. (Owner's explicit choice over "land on the
   calendar immediately".)
3. Land on **this month**, empty, with an obvious add/capture control and the
   kind legend visible.
4. First capture: share a screenshot or text of a booking email into the app
   (or paste inside it) → the app proposes title, date/time, place and kind →
   owner confirms → a correctly coloured event is on the calendar.

What brings them back: the next booking email. Capture must be faster and
produce a better event than Google's auto-create, or the owner will keep using
Google.

## 4. Core features (v1)

In priority order; each is load-bearing for the summary above.

1. **Calendar views and editing** — month, week and day views; create, edit,
   move and delete events; title, start/end (all-day or timed), location,
   notes, kind. Every event is editable regardless of origin.
2. **Event kinds with default colours** — a kind is a named colour. Ships with
   defaults; the owner can rename/recolour/add/delete. Owner's required list:
   movies; entertainment (mini golf, Top Golf, basketball games, theme parks —
   distinct from movies); flights; hotel stays (distinct from flights); other
   travel (trains, etc.); restaurant reservations; birthdays; gym; work /
   meetings; appointments (doctor, dentist); social / personal.
3. **Capture from text or screenshot** — three entry paths, all v1:
   - Android share sheet → share a **screenshot** to the app (Web Share Target).
   - Android share sheet → share **selected text** to the app.
   - Inside the app: a capture screen with a paste box and an image picker.
   The app sends the input to an LLM (Gemini, owner's choice; owner supplies
   the key) and gets back a proposed event: title, start/end, location, kind.
   The owner reviews and confirms before anything is saved. Confidence/missing
   fields are shown rather than guessed silently.
4. **Sync across devices** — one account (Sign in with Google); changes on the
   phone appear on the laptop within seconds and vice versa. Offline reads and
   edits on the PWA, reconciled when back online.
5. **Recurring events** — at least yearly (birthdays) and weekly (gym); edit
   one occurrence or the series.
6. **Reminders** — per-event reminder time; push notification on the Android
   PWA (and browser notification on the laptop). Must actually fire when the
   app is closed, which means a server-side scheduler.
7. **Installable PWA on Android** — home-screen install, works offline, share
   target registered.

## 5. Explicit non-goals (v1)

- Sharing, inviting, or any second user.
- Importing existing Google Calendar history (`.ics` or API). Starts empty.
- Direct Gmail / Google account connection for automatic capture — **v2**, and
  Sign in with Google is chosen partly to make that easy later.
- iOS. (Android only on mobile; the web app still works in Safari but is not a
  target.)
- Native Android app / Play Store. PWA is the v1 answer.
- Multiple calendars, time-zone juggling beyond the device's zone, attachments,
  video-call links, free/busy, tasks.

## 6. Constraints

- **Platform:** web app (desktop browser) + installable PWA on Android, one
  codebase.
- **Data:** stored server-side and synced; single account. Captured images and
  text are sent to a third-party LLM (Gemini) — accepted by the owner.
- **Cost:** hosting near $0/month on free tiers; the owner pays only for LLM
  calls (fractions of a cent per capture). No deadline.
- **Auth:** Sign in with Google, one allowed account.
- **Backend:** owner said "you decide, keep it cheap/simple". **PO proposal,
  pending the owner's nod in `/plan-product`:** a small hosted backend on a
  free tier (database + auth + a scheduled function for reminders), with the
  PWA as the only client. The stack is pinned in `stack.md`, not here.
- **Offline:** the PWA must open and show the calendar without a network;
  edits queue and sync.
- **Notifications:** web push on Android Chrome; requires the user to grant
  permission once.

## 7. Success

The owner will judge v1 by all four, observably:

1. **Replacement:** within a few weeks of daily use, new events go into this
   app and not Google Calendar.
2. **Capture:** a real booking email (screenshot or text) becomes a correct,
   correctly-coloured event in under 30 seconds including review.
3. **Sync:** an event added on the phone shows on the laptop (and vice versa)
   within seconds, and nothing is lost after an offline edit.
4. **Reminders:** a reminder set on the phone fires at the right time with the
   app closed.

## 8. Look and feel

Clean, Google-Calendar-like, **colour-forward**. Familiar layout — month/week/
day grid, event chips, side panel or sheet for editing — so there is nothing to
relearn. The kind colours *are* the visual identity: chrome stays quiet and
neutral so the coloured events read at a glance; the legend is always
reachable. Mobile-first interaction for capture (share sheet → confirm screen
→ done in two taps); desktop-first for browsing a week. Defaults to the system
light/dark preference.

## Decisions taken after the interview (2026-10-12, owner agreed)

- **Backend:** Supabase free tier — Postgres, Google sign-in, edge functions,
  scheduled jobs for reminders. The TypeScript PWA is the only client.
- **Gemini key:** server-side secret. Captures go browser → edge function →
  Gemini; the key never reaches the browser.
- **Recurrence in v1:** daily, weekly, yearly, with an optional end date.
  Custom rules (every N weeks, "2nd Tuesday", RRULE) are v2.

## Open questions

- **Gemini model:** which model; to be pinned in `stack.md`.
- **Default colours** for the eleven kinds: the Lead Designer proposes a
  palette; the owner reviews during the kinds walkthrough.
- **Reminder delivery when the laptop is closed** is out of reach (no server
  push to a closed browser); the phone is the device that must be reliable.
- **Time zones:** v1 assumes the device's zone; flights across zones are
  entered as shown on the booking. Revisit if it bites.
