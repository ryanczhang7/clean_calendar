---
id: EPIC-08
title: Shipped and smoke-tested
status: todo
stories: [CAL-030, CAL-031]
---

## Goal

`main` deploys the PWA to its production origin and the schema and functions
to the hosted Supabase project; one end-to-end test exercises sign-in, create,
capture and render against a local stack so the walking path cannot regress
unnoticed.

## Why now

Success criterion 1 ("replacement") needs the app on the owner's phone from a
stable origin; share target and push both require it. Can start as soon as
the bootstrap lands and is finished last.

## Done when

A merge to `main` results in the new build at the production URL and the
migrations applied; `bash scripts/gates.sh --gate integration` runs the smoke
flow green on a machine with Docker.

## Stories

1. CAL-030 — deploy on merge: Cloudflare Pages, Supabase migrations and functions
2. CAL-031 — end-to-end smoke flow against the local stack

## Deliberately not in this epic

Staging environments, monitoring beyond Supabase's own logs, a custom domain.
