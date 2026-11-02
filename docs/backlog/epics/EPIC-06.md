---
id: EPIC-06
title: Recurring events
status: todo
stories: [CAL-023, CAL-024, CAL-056, CAL-025]
---

## Goal

Birthdays repeat yearly and gym repeats weekly: an event can recur daily,
weekly or yearly with an optional end date, shows on every occurrence, and
one occurrence or the whole series can be edited or deleted.

## Why now

Brief §4.5, and the decision recorded after the interview fixes the scope to
daily/weekly/yearly + end date. The reminder scheduler (EPIC-07) needs the
same expansion on the server, so the expander is shared code and comes first.

## Done when

A weekly event created on a Monday appears on every Monday until its end
date; editing "this occurrence" changes one chip; editing "the series" changes
all others; deleting one occurrence leaves the rest.

## Stories

1. CAL-023 — recurrence expansion as a pure, shared module
2. CAL-024 — recurring events on the calendar and the recurrence field in the form
3. CAL-025 — edit or delete one occurrence or the whole series

## Deliberately not in this epic

Every-N-weeks, "second Tuesday", RRULE import/export. (Moving one occurrence
to a different day while keeping the series was listed here; the owner put it
in scope on 2026-11-02 - CAL-025, PO decision 7: the override carries the new
start and end, as it does for a time change.)
