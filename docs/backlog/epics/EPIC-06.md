---
id: EPIC-06
title: Recurring events
status: todo
stories: [CAL-023, CAL-024, CAL-056, CAL-025, CAL-074, CAL-075, CAL-077, CAL-078, CAL-079, CAL-080, CAL-081, CAL-082, CAL-083]
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
4. CAL-074 — (fix) two occurrences of one series on the same day are told apart
5. CAL-075 — (fix) a whole-series keyboard move keeps focus on the moved occurrence
6. CAL-077 — (fix) a yearly series moved by keyboard across the end of February keeps focus, and the toast names the landing date
7. CAL-078 — (fix) a one-day yearly event on 28 February is drawn on one day in a leap year
8. CAL-079 — (fix) a repeating event whose start falls in a spring-forward gap never ends before it starts
9. CAL-080 — (fix) choosing This event only again after All events applies the change to one occurrence
10. CAL-081 — (fix) two occurrences of one series on one day are laid out in columns of their own
11. CAL-082 — (fix) the edit-scope answer writes the occurrence's own series and override, and closes the dialog
12. CAL-083 — (fix) an all-day repeating event stored beside a midnight clock change covers whole local days

8 to 11 were filed by the mutation audit of 2026-11-21 (`docs/wiki/audits/EPIC-06-2026-11-21.md`).
12 was filed on 2026-11-21 from a finding made while planning CAL-079 (CAL-079, `## Notes`); it waits on CAL-079.

## Deliberately not in this epic

Every-N-weeks, "second Tuesday", RRULE import/export. (Moving one occurrence
to a different day while keeping the series was listed here; the owner put it
in scope on 2026-11-02 - CAL-025, PO decision 7: the override carries the new
start and end, as it does for a time change.)
