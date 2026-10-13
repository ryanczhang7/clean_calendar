---
id: EPIC-04
title: Two devices, one calendar, online or not
status: todo
stories: [CAL-014, CAL-015, CAL-016, CAL-017]
---

## Goal

The app opens and shows the calendar without a network, edits made offline
queue and apply when the network returns, a change on the phone appears on
the laptop within seconds, and the app installs to the Android home screen.

## Why now

Brief §4.4 and §4.7, and success criterion 3 ("nothing is lost after an
offline edit"). The capture share target (EPIC-05) needs the installed PWA.

## Done when

Airplane mode: the calendar renders and an edit is accepted; back online: the
edit is on the server within seconds and the other device shows it without a
reload; a conflicting edit on two devices resolves to the server's copy with
a visible notice; "Install" on Android Chrome puts the icon on the home screen.

## Stories

1. CAL-014 — the calendar renders from the local cache, online or offline
2. CAL-015 — offline edits queue in an outbox and drain, with a conflict notice
3. CAL-016 — changes from another device arrive over Realtime within seconds
4. CAL-017 — installable PWA with an offline app shell

## Deliberately not in this epic

Merging concurrent edits field-by-field (last writer wins per row is the
rule), background sync while the app is closed, the share target itself
(EPIC-05).
