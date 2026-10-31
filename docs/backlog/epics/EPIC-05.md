---
id: EPIC-05
title: A booking e-mail becomes an event
status: todo
stories: [CAL-018, CAL-019, CAL-020, CAL-021, CAL-022, CAL-047, CAL-048]
---

## Goal

Share a screenshot or the text of a booking e-mail to the app from the
Android share sheet, or paste it inside the app; Gemini proposes title,
times, location and kind; the owner reviews, fixes anything missing and
confirms; a correctly coloured, fully editable event is on the calendar in
under 30 seconds.

## Why now

Brief §1: this is the second thing Google gets wrong and the reason to
switch. Success criterion 2 is measured here.

## Done when

All three entry paths (share image, share text, in-app paste or pick) reach
the same confirm screen; the proposal shows what the model was unsure of
and what it could not find; confirming writes a normal event with
`origin = capture`; the Gemini key is never in the browser bundle.

## Stories

1. CAL-018 — the capture edge function turns shared text into a proposed event
2. CAL-019 — the capture edge function accepts a screenshot
3. CAL-020 — in-app capture screen: paste or pick, confirm, save
4. CAL-021 — confidence and missing fields are shown, never guessed silently
5. CAL-022 — Android share target delivers text and images to the capture screen
6. CAL-047 — fix: the capture function answers the browser's CORS preflight and
   every reply carries `Access-Control-Allow-Origin` (found on the owner's first
   use, CAL-030 notes)
7. CAL-048 — fix: the capture function calls `gemini-3.8-flash`; 2.5 Flash is
   retired and every hosted capture failed `upstream 404` (CAL-047 notes)

## Deliberately not in this epic

Automatic Gmail capture (v2), storing the screenshot, multiple events from one
message, learning the owner's corrections.
