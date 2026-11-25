---
id: EPIC-02
title: Event kinds with default colours
status: todo
stories: [CAL-006, CAL-007, CAL-008, CAL-091, CAL-092, CAL-093, CAL-094]
---

## Goal

The owner's first sign-in seeds the eleven default kinds with the designer's
palette, walks them through renaming, recolouring, deleting and adding kinds
before they see the calendar, and from then on the legend is always one tap
away and the kinds page is where colours are changed.

## Why now

The brief's first complaint is that colour does not mean kind (§1). The kind
list is the product's visual identity (§8) and the first five minutes (§3)
show the walkthrough before the calendar, so it precedes the views.

## Done when

A fresh account sees the walkthrough with eleven coloured kinds; every edit
in it persists; dismissing it lands on the calendar with the legend visible;
the kinds page allows the same edits later; a kind's chip text always meets
4.5:1 against its colour in both themes.

## Stories

1. CAL-006 — the eleven default kinds are seeded on first sign-in
2. CAL-007 — kinds walkthrough: rename, recolour, delete, add, then continue
3. CAL-008 — kind legend in the shell and the kinds settings page (kinds only; per-kind counts cut from v1, see `components.md`, PO decisions)
4. CAL-091 — the kind legend's shortcut answers only L, and an outside click keeps
   the focus it gave (first mutation audit, `docs/wiki/audits/EPIC-02-2026-11-25.md`)
5. CAL-092 — the kind editor sends one save per press, never navigates, and lets a
   refused save be retried (same audit)
6. CAL-093 — the kind editor opens without the delete question, and the dark
   group's Custom opens the dark hex (same audit)
7. CAL-094 — the colour walks keep a red's hue, and a colour at exactly 4.50:1
   passes (same audit)

## Deliberately not in this epic

Assigning kinds to events (EPIC-03), the model choosing a kind (EPIC-05),
icons per kind (the chip carries the kind's initial; icons are v2).
