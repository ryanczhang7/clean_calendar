---
id: EPIC-03
title: A calendar you can browse and edit
status: todo
stories: [CAL-009, CAL-010, CAL-011, CAL-012, CAL-013]
---

## Goal

Month, week and day views that look like the calendar the owner already
uses: events as kind-coloured chips, a today marker, navigation and view
switching reflected in the URL, and an event sheet to create, edit, move and
delete any event, whatever created it.

## Why now

Brief §4.1 is the top-priority feature and the first success criterion
("new events go into this app") cannot be met without it.

## Done when

The owner can create an event from the month, week or day view, see it
coloured by its kind, edit every field, drag it to another slot, delete it
and undo the delete, and reload to find it all still there.

## Stories

1. CAL-009 — month view renders events as kind-coloured chips
2. CAL-010 — week and day views with a time grid
3. CAL-011 — navigation, view switching and URL state
4. CAL-012 — create and edit an event in the sheet
5. CAL-013 — move by drag and delete with undo

## Deliberately not in this epic

Offline rendering (EPIC-04), recurrence (EPIC-06), reminders (EPIC-07),
multiple calendars, time zones other than the device's.
