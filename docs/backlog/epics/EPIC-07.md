---
id: EPIC-07
title: Reminders that fire with the app closed
status: todo
stories: [CAL-026, CAL-027, CAL-028, CAL-029]
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

1. CAL-026 — reminder field on the event, stored and synced
2. CAL-027 — notification permission and push subscription per device
3. CAL-028 — the send-reminders function on a one-minute schedule
4. CAL-029 — reminders for every occurrence of a recurring event

## Deliberately not in this epic

Snooze, multiple reminders per event, e-mail or SMS fallbacks, reminders while
the laptop is closed (brief: out of reach).
