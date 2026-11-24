---
id: EPIC-07
title: Reminders that fire with the app closed
status: todo
stories: [CAL-026, CAL-057, CAL-027, CAL-028, CAL-029, CAL-058, CAL-073, CAL-072, CAL-085, CAL-086, CAL-087, CAL-088, CAL-089, CAL-090]
---

## Goal

An event can carry a reminder; the phone shows a push notification at the
right time whether or not the app is open; the laptop browser shows one if
it is open; tapping it opens the event.

## Why now

Brief §4.6 and success criterion 4. Needs the installed PWA (EPIC-04) and the
recurrence expander (EPIC-06) for repeating events.

## Done when

A reminder set on the phone for 10 minutes before an event fires on the
phone at that time with the app closed and opens the event when tapped; the
same for every occurrence of a recurring event; a device that revokes
permission stops receiving and is pruned.

## Stories

1. CAL-026 — reminders stored and synced through the outbox
2. CAL-057 — the reminder field on the event sheet and the bell on the chip
3. CAL-027 — notification permission and push subscription per device
4. CAL-028 — the send-reminders function on a one-minute schedule
5. CAL-029 — reminders for every occurrence of a recurring event
6. CAL-058 — opening `/day/{date}?event={id}` opens that event's sheet (the
   URL CAL-028's notification navigates to)
7. CAL-073 — a device re-subscribes when the VAPID key has changed (CAL-027
   review follow-up)
8. CAL-072 — the reminder's All-day basis on a repeating date is pinned, and
   the live-template rule lives once (CAL-057 review follow-up)
9. CAL-085 — the service-role check accepts every base64url spelling of the
   cron's key, and refuses a token without three segments (EPIC-07 mutation
   audit, `docs/wiki/audits/EPIC-07-2026-11-23.md`)
10. CAL-086 — the send-reminders failure lines say what failed, and a
    `sent_at` write that throws does not stop the run (same audit)
11. CAL-087 — switching All day keeps a numbered reminder as it is, and "At
    time" on a timed date of an all-day series is 09:00 (same audit)
12. CAL-088 — a reminder-only save that failed can be saved again (same
    audit)
13. CAL-089 — a save that was refused can be saved again, and a second Save
    while one is in flight writes once (EPIC-07 follow-up audit,
    `docs/wiki/audits/EPIC-07-2026-11-24.md`)
14. CAL-090 — a `sent_at` write that answers non-2xx is logged, and the run
    carries on; repeats while the reminder is due are accepted (same
    follow-up audit, Decided 5 and E-PO2; the user's decision of 2026-11-24)

## Deliberately not in this epic

Snooze, multiple reminders per event, e-mail or SMS fallbacks, reminders while
the laptop is closed (brief: out of reach).
