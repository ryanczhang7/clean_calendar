---
id: EPIC-07
title: Reminders that fire with the app closed
status: todo
stories: [CAL-026, CAL-057, CAL-027, CAL-028, CAL-029, CAL-058, CAL-073]
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

## Deliberately not in this epic

Snooze, multiple reminders per event, e-mail or SMS fallbacks, reminders while
the laptop is closed (brief: out of reach).
