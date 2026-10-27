# Architecture — Clean Calendar

_Written 2026-10-12 by `/plan-product`. Altitude: true for months. Anything
that changes per story belongs in the story. Versions are in `stack.md`._

## Components

```
┌────────────────────────── Android Chrome / desktop browser ──────────────────────────┐
│  PWA (React, Vite)                                                                   │
│   ├─ ui/        calendar views, event sheet, kinds, capture + confirm, settings      │
│   ├─ domain/    pure TS: recurrence, occurrence expansion, colour, validation        │
│   ├─ data/      repositories over supabase-js (events, kinds, overrides, reminders)  │
│   ├─ sync/      Dexie cache + outbox + realtime subscription + reconcile             │
│   └─ sw.ts      service worker: precache, share-target POST handler, push display   │
└───────────┬───────────────────────────────┬───────────────────────────┬─────────────┘
            │ PostgREST + Realtime (JWT)     │ functions/v1/capture (JWT) │ Web Push
┌───────────▼───────────────────────────────▼───────────────────────────│─────────────┐
│  Supabase (free tier)                                                  │             │
│   Postgres + RLS ─ pg_cron ─ pg_net ──► edge fn send-reminders ──► push service ────┘
│   Auth (Google)                           edge fn capture ───────► Gemini API
└──────────────────────────────────────────────────────────────────────────────────────┘
```

| Component | Responsibility | Lives in |
|---|---|---|
| **ui** | Screens and components. Reads through `sync`, never supabase-js directly. | `src/calendar`, `src/events`, `src/kinds`, `src/capture`, `src/reminders`, `src/app` |
| **domain** | Pure functions with no I/O: recurrence expansion, month/week grid maths, colour contrast, proposal validation. The code the unit tests love. Part of it is shared with the functions. | `src/domain`, `shared/` |
| **data** | Typed repositories over supabase-js: `kinds`, `events`, `eventOverrides`, `reminders`, `pushSubscriptions`, `captureJobs`. One module per table. | `src/data` |
| **sync** | The local store (Dexie/IndexedDB) that the UI reads from; the outbox of pending mutations; the Realtime subscription that applies remote changes; the reconcile rule. | `src/sync` |
| **service worker** | Precache the app shell; receive the share-target `POST`, stash the payload in IndexedDB and open `/capture`; show push notifications and route the click. | `src/sw.ts` |
| **capture** function | Accepts `{text?}` or `{image: base64, mime}` with the user's JWT, calls Gemini with a fixed prompt and a JSON response schema, validates the reply with the shared zod schema, records a `capture_jobs` row, returns the proposal. Holds the only Gemini key. | `supabase/functions/capture` |
| **send-reminders** function | Invoked every minute by `pg_cron`; selects reminders due in the window, sends a web push per subscription, marks `sent_at`, prunes dead subscriptions (410). | `supabase/functions/send-reminders` |
| **Postgres** | Source of truth. RLS limits every table to the one allowed account. | `supabase/migrations` |

## Data model (outline)

All tables carry `id uuid pk default gen_random_uuid()`, `created_at`,
`updated_at timestamptz` (trigger-maintained) and are covered by the same RLS
predicate: `auth.jwt() ->> 'email' = (select owner_email from app_config)`.
There is no `owner_id` column — single user by construction; adding one later
is a migration, not a redesign.

| Table | Columns (outline) | Notes |
|---|---|---|
| `app_config` | `owner_email text` (one row) | The allowed account. Set by migration/seed; never written by the client. |
| `kinds` | `name text`, `color_light text`, `color_dark text`, `sort_order int`, `is_default bool`, `deleted_at` | A kind is a named colour pair. Soft-delete so events keep a kind; deleted kinds render with the neutral chip. Eleven defaults seeded on first sign-in by the client (`kinds` empty ⇒ insert defaults). |
| `events` | `title text`, `kind_id uuid fk`, `starts_at timestamptz`, `ends_at timestamptz`, `all_day bool`, `location text`, `notes text`, `recurrence jsonb null`, `origin text` (`manual`\|`capture`), `capture_job_id uuid null`, `deleted_at` | For a recurring event the row is the **series**: `starts_at/ends_at` are the first occurrence; `recurrence = {freq: 'daily'\|'weekly'\|'yearly', until: date \| null, tz: string}`, where `tz` is the IANA zone of the device that saved the series so the server expands in the same wall time (PO decision 2026-10-12, CAL-023). All-day events store local-midnight in UTC and `all_day = true`, with `ends_at` exclusive (midnight after the last day); the client treats the date part as authoritative. |
| `event_overrides` | `event_id fk`, `occurrence_date date`, `cancelled bool`, plus nullable copies of every editable column | "Edit one occurrence": an override row keyed by the occurrence's original date. Cancelled = that occurrence deleted. Editing the series clears nothing; overrides win where they exist. |
| `reminders` | `event_id fk`, `minutes_before int`, `sent_at timestamptz null`, `occurrence_date date null` | For a non-recurring event one row, `occurrence_date null`. For a series the scheduler materialises a row per upcoming occurrence (see Reminders). `fire_at = starts_at - minutes_before`; an all-day event's "at time" is stored as `-540` (09:00 on the day). |
| `push_subscriptions` | `endpoint text unique`, `p256dh text`, `auth text`, `user_agent text`, `last_seen_at` | One per installed device. |
| `capture_jobs` | `input_kind text` (`text`\|`image`), `input_hash text`, `model text`, `proposal jsonb`, `confidence jsonb`, `status text` (`proposed`\|`confirmed`\|`discarded`), `error text`, `latency_ms int` | Audit trail of every Gemini call; the input itself is **not** stored (privacy + size), only its hash. |

**Colour** is a property of the kind, never of the event. The chip colour is
`kinds.color_light` or `color_dark` by the active theme. Events whose kind was
deleted render in `--chip-neutral`.

## How the pieces talk

- **Browser → Postgres:** supabase-js over PostgREST with the user's JWT. The
  UI never calls it directly; `data/` does, and only `sync/` calls `data/`.
- **Browser → capture:** `supabase.functions.invoke('capture', {body})`, JWT
  attached by the client; the function verifies the JWT (`verify_jwt = true`)
  and additionally checks the e-mail against `app_config`.
- **Postgres → send-reminders:** a `pg_cron` job every minute runs
  `net.http_post(url := <functions url>/send-reminders, headers := {Authorization: Bearer <service role>})`,
  URL and key read from Vault. The function uses the service role to read
  across RLS; it is not callable by the browser (checks for the service-role
  claim).
- **send-reminders → device:** Web Push protocol with VAPID. The payload is
  `{title, body, url, eventId}`; the service worker shows it and opens the URL
  on click.
- **Postgres → browser (sync):** Realtime `postgres_changes` on `events`,
  `event_overrides`, `kinds`, `reminders`; each change is applied to the Dexie
  cache, which the UI observes through `useLiveQuery`.

## Where state lives

| State | Authority | Cached where | Notes |
|---|---|---|---|
| Events, kinds, overrides, reminders | Postgres | Dexie (`cache` tables), full copy — one user, a few thousand rows | The UI renders **only** from Dexie, online or offline. "Online" means the outbox drains and Realtime is connected. |
| Pending edits | Dexie `outbox` | — | Every create/update/delete is written to the cache optimistically **and** appended to the outbox as `{op, table, id, patch, client_ts}`. The outbox drains in order while online; a failed op (4xx) is surfaced in the UI with retry/discard, a 5xx/offline op waits. |
| Session | Supabase Auth (localStorage refresh token) | — | Offline open works while the refresh token is valid; the cache is readable regardless. |
| Theme, last view, onboarding-done | `localStorage` (theme, view), Postgres `kinds` presence (onboarding) | — | Onboarding is "done" when the walkthrough has been dismissed once; stored as a row in `app_config`-adjacent `user_prefs` later if needed; v1 uses `localStorage` plus "kinds exist". |
| Push subscription | Postgres | Browser's `PushManager` | Re-registered on every app start; endpoint changes are upserts. |
| Capture inbox (shared payload) | its own small IndexedDB database (`src/pwa/inbox.ts`), not the cache | — | The service worker writes it from the share-target POST; `/capture` reads and clears it. Kept apart so the worker never imports the cache schema (CAL-022). |

**Build order of the sync seam.** The UI reads through hooks in `src/sync/`
(`useKinds`, `useEventsInRange`, later `useOverrides`, `useOccurrences`) and
writes through action modules (`kindActions`, `eventActions`, …). EPIC-02 and
EPIC-03 introduce these hooks and actions **online**, straight over the
repositories; EPIC-04 (CAL-014, CAL-015) moves them onto the Dexie cache and
the outbox **behind the same signatures**, so no view changes. The rule "the
UI renders only from Dexie" is therefore true from CAL-014 on, not before.

**Conflict rule (sync).** Last writer wins **per row**, decided by the server:
each outbox op carries the row's `updated_at` the client last saw; the update
is `… where id = ? and updated_at = ?`. If zero rows match, the server copy is
newer: the client re-fetches the row, replaces its cache copy, drops the op and
shows a one-line "edited elsewhere; your change to *title* was not applied"
toast with a redo. Deletes always win over edits. This is the whole rule:
one user on two devices rarely edits the same event concurrently, so the
merge case is a notification, not a UI.

**Recurrence.** Expansion happens in the client (`shared/recurrence.ts`) over
the visible range: for each series, generate occurrence dates for
`freq/until`, drop cancelled overrides, apply field overrides. The same module
runs in `send-reminders` under Deno to decide which upcoming occurrences need
a `reminders` row. One implementation, two runtimes, one test suite under
Vitest plus a smoke test under Deno asserting the same fixture results.
Occurrences keep their wall-clock time in the series' `tz` across DST; a yearly
series on 29 February occurs only in leap years.

**Reminders.** The scheduler runs every minute. It (1) materialises reminder
rows for occurrences of recurring events falling in the next 48 h that do not
yet have one, (2) selects rows with `fire_at = occurrence start − minutes_before`
in `[now − 5 min, now]` and `sent_at is null`, (3) pushes, (4) marks `sent_at`.
Idempotent: a crash between (3) and (4) resends once, which is the lesser evil.
Brief open question acknowledged: a closed laptop browser cannot receive push;
the phone is the reliable device.

**Capture.** `/capture` receives text, an image, or a shared payload from the
inbox. It POSTs to the function, gets `{proposal, confidence, missing}`,
renders the confirm screen with every field editable, highlights `missing`
fields and low-confidence ones, and on confirm writes the event through the
normal `sync` path with `origin = 'capture'` and the `capture_job_id`. Kind
assignment: the model is given the user's kind names and returns one of them
(or `null`); the client maps the name back to the id. Nothing is saved until
the user confirms.

**Share target.** The manifest declares `share_target` with `method: POST`,
`enctype: multipart/form-data`, `action: /share`, `params: {text, title, url,
files: [{name: 'image', accept: ['image/*']}]}`. The service worker intercepts
`POST /share`, stores the fields (title, text and url joined by blank lines)
and the file's bytes, MIME type and name in the Dexie `inbox` (its own
database, `src/pwa/inbox.ts`; at most one entry), and responds with a 303 to
`/capture?from=share`, which takes the entry - read and cleared in one
transaction - and prefills the capture screen (CAL-022).

## Deployment shape

- **Static PWA** on Cloudflare Pages, built from `main` by a GitHub Action
  (`pnpm build`), one production origin. Preview builds per PR are fine but not
  installable share targets (origin differs), so manual device testing uses
  production or `pnpm dev` with `--host` over the LAN.
- **Supabase**: one hosted project. Schema is applied with `supabase db push`
  from the same workflow on `main`; functions deployed with `supabase functions
  deploy`. Secrets (`GEMINI_API_KEY`, VAPID keys, Google OAuth client) set once
  in the dashboard, never in the repo. Local development uses `supabase start`
  with the same migrations and `seed.sql`.
- **Environments**: local (Docker), production. No staging — one user.
- **Observability**: `capture_jobs` is the log for captures; Supabase function
  logs for the rest. No third-party service.

## Decisions

| Decision | Chosen | Alternatives, and why they lost |
|---|---|---|
| Backend | Supabase (brief's decision) | Firebase: push + functions are fine but Firestore makes the recurrence/overrides query model awkward and RLS-equivalent rules are less testable. Self-hosted: not $0, and the owner wanted simple. |
| Single-account enforcement | RLS on `auth.jwt() ->> 'email'` vs `app_config.owner_email` | Supabase "before sign-up" hook: not on the free tier's hook set at planning time; a client-side check alone is not security. The RLS form is one predicate, testable in the `db` project. |
| Gemini model | `gemini-2.5-flash`, REST, JSON schema | Pro: ~10x cost for an easy task. `-latest` aliases: move under you. SDK: one more dep to track in Deno for a single POST. |
| Gemini key | Function secret, browser never sees it (brief's decision) | — |
| Offline store | Dexie (IndexedDB) | TanStack Query persister: a cache, not a store; offline edits need an outbox anyway. localStorage: too small for images in the inbox. |
| Sync | Full-copy cache + outbox + Realtime, server LWW | CRDT/op-log: a one-user product does not need it. Polling: Realtime is free and "within seconds" is a success criterion. |
| Recurrence | Own expander for daily/weekly/yearly + until, stored as JSON (brief's decision) | `rrule` library: brings RRULE semantics v1 explicitly excludes; moving to it in v2 means replacing one module behind the same `expand()` signature. |
| Overrides | `event_overrides` keyed by occurrence date | Splitting the series on edit (Google's model): more rows to keep consistent, and "edit the series" becomes a merge problem. |
| Reminders | Server-side `pg_cron` + edge function + Web Push (brief's requirement) | Client-side `setTimeout`/Notification Triggers API: not available on Android Chrome stable; does not fire with the app closed. |
| Rendering | React + CSS Modules + tokens | Svelte/Solid: fine, but React has the strongest Testing Library story and the harness's profile is written for it. Tailwind: adds a build-time palette that competes with runtime kind colours. |
| Hosting | Cloudflare Pages | GitHub Pages: subpath origin complicates SW scope and share-target action. Vercel/Netlify: equivalent; Cloudflare chosen for the generous free tier and no sleep. |
| Shared code | `shared/` at root, relative-imported by Deno | Duplicating recurrence in the function: two implementations of the one piece of logic that must agree. Publishing a package: ceremony for one consumer. |
| Dates | `timestamptz` + `all_day` flag, device zone in the client | Separate `date` columns for all-day: two code paths for every query. Full time-zone support: brief excludes it. |

## Limits worth knowing

- Captured **images are sent to Gemini and not stored**; only a hash and the
  proposal are kept. If the owner later wants "show me the screenshot", that
  is a storage bucket and a story.
- **Resending a reminder** after a crash between push and `sent_at` is
  possible; the window is one minute.
- **Supabase free tier pauses** inactive projects after 7 days. Daily use keeps
  it alive; CAL-030 documents the unpause.
- The Realtime channel **does not deliver while the PWA is closed**; sync
  happens on next open (full refetch of rows with `updated_at > last_sync`).
