---
id: EPIC-01
title: The repository runs, builds and signs in
status: todo
stories: [CAL-001, CAL-002, CAL-003, CAL-004, CAL-005]
---

## Goal

A developer can clone the repository, install the toolchain, run every gate,
start the app, sign in with the one allowed Google account and see an empty
shell whose data layer talks to a Supabase schema protected by row-level
security. Nothing user-visible beyond sign-in and a themed empty page, but
every later epic builds on exactly this.

## Why now

Everything depends on it. The brief's constraints that bite earliest are
"one allowed account" (§6) and "hosting near $0" (§6): both are settled here,
in the schema and the stack, before a single event exists.

## Done when

`bash scripts/gates.sh` is green on `main`; `bash scripts/task.sh dev` serves
the app; signing in with the owner's Google account lands on the shell, and
signing in with any other account is refused with a message; the `db` gate
proves that a JWT for another e-mail reads zero rows from every table.

## Stories

1. CAL-001 — bootstrap: the Vite + React + Supabase + Deno layout with every gate live
2. CAL-002 — walking skeleton: design tokens, app shell, system light/dark theme, a placeholder per route
3. CAL-003 — Sign in with Google, one allowed account
4. CAL-004 — core schema with single-account row-level security
5. CAL-005 — kinds, events and overrides repositories

## Deliberately not in this epic

Any calendar rendering, kinds UI, offline behaviour, deployment to Cloudflare
(EPIC-08), the capture and reminder functions.
