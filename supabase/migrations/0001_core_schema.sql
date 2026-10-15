-- CAL-004: the core schema, with single-account row-level security.
--
-- Every table shares one predicate: a row is visible and writable only when
-- the JWT's e-mail equals app_config.owner_email (public.is_owner()). This is
-- the real enforcement of the brief's "one allowed account"; the client-side
-- check (CAL-003) is only its user experience.
--
-- Order: extension -> predicate -> tables (capture_jobs before events, whose
-- FK points at it) -> indexes and uniqueness -> updated_at trigger -> RLS ->
-- grants. Applied to a fresh database by `supabase db reset`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- app_config first: the predicate below reads it, and a SQL-language function
-- body is validated against the catalog when it is created.

create table public.app_config (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_email text not null,
  singleton boolean not null default true unique,
  constraint app_config_single_row check (singleton)
);

-- ---------------------------------------------------------------------------
-- The predicate. security definer so a policy can read app_config whatever
-- the caller's grants; lower(trim()) on both sides is CAL-003's isOwnerEmail
-- rule; an empty or missing claim is never the owner, and the result is never
-- null (no app_config row also means "not the owner").

create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') <> ''
     and coalesce(
           lower(trim(auth.jwt() ->> 'email'))
             = lower(trim((select owner_email from public.app_config limit 1))),
           false
         )
$$;

revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The client tables. capture_jobs precedes events: events.capture_job_id
-- references it.

create table public.kinds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (length(trim(name)) between 1 and 32),
  color_light text not null check (color_light ~ '^#[0-9a-fA-F]{6}$'),
  color_dark text not null check (color_dark ~ '^#[0-9a-fA-F]{6}$'),
  sort_order int not null default 0,
  is_default boolean not null default false,
  deleted_at timestamptz
);

create table public.capture_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  input_kind text not null check (input_kind in ('text', 'image')),
  input_hash text not null,
  model text not null,
  proposal jsonb,
  confidence jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'discarded')),
  error text,
  latency_ms int
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null check (length(title) between 1 and 120),
  kind_id uuid not null references public.kinds (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  all_day boolean not null default false,
  location text,
  notes text,
  recurrence jsonb,
  origin text not null default 'manual'
    check (origin in ('manual', 'capture')),
  capture_job_id uuid references public.capture_jobs (id) on delete set null,
  deleted_at timestamptz
);

create table public.event_overrides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  event_id uuid not null references public.events (id) on delete cascade,
  occurrence_date date not null,
  cancelled boolean not null default false,
  title text,
  kind_id uuid references public.kinds (id),
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  location text,
  notes text
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  event_id uuid not null references public.events (id) on delete cascade,
  minutes_before int not null,
  sent_at timestamptz,
  occurrence_date date
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_seen_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes and uniqueness (AC-1)

-- One live kind per case-insensitive name; makes CAL-006's concurrent first
-- sign-in on two devices safe. A soft-deleted kind frees its name.
create unique index kinds_live_name_key
  on public.kinds (lower(name)) where deleted_at is null;

-- One reminder per (event, occurrence), a null occurrence counting as one
-- value; makes CAL-029's materialisation idempotent.
alter table public.reminders
  add constraint reminders_event_occurrence_key
  unique nulls not distinct (event_id, occurrence_date);

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_key unique (endpoint);

alter table public.event_overrides
  add constraint event_overrides_event_occurrence_key
  unique (event_id, occurrence_date);

create index events_starts_at_idx on public.events (starts_at);
create index events_kind_id_idx on public.events (kind_id);

-- ---------------------------------------------------------------------------
-- updated_at (AC-6): overwritten unconditionally, whatever the client sent;
-- greatest() guards a clock that did not advance within the microsecond.

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at :=
    greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end
$$;

create trigger app_config_set_updated_at
  before update on public.app_config
  for each row execute function public.set_updated_at();
create trigger kinds_set_updated_at
  before update on public.kinds
  for each row execute function public.set_updated_at();
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();
create trigger event_overrides_set_updated_at
  before update on public.event_overrides
  for each row execute function public.set_updated_at();
create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();
create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();
create trigger capture_jobs_set_updated_at
  before update on public.capture_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security. Enabled, not forced: the migration owner bypasses it.
-- app_config gets only a select policy, so owner writes are refused by RLS
-- itself (AC-5); the service role bypasses RLS. anon has no policy (AC-4).

alter table public.app_config enable row level security;
alter table public.kinds enable row level security;
alter table public.events enable row level security;
alter table public.event_overrides enable row level security;
alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.capture_jobs enable row level security;

create policy app_config_select_owner on public.app_config
  for select to authenticated using (public.is_owner());

create policy kinds_select_owner on public.kinds
  for select to authenticated using (public.is_owner());
create policy kinds_insert_owner on public.kinds
  for insert to authenticated with check (public.is_owner());
create policy kinds_update_owner on public.kinds
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy kinds_delete_owner on public.kinds
  for delete to authenticated using (public.is_owner());

create policy events_select_owner on public.events
  for select to authenticated using (public.is_owner());
create policy events_insert_owner on public.events
  for insert to authenticated with check (public.is_owner());
create policy events_update_owner on public.events
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy events_delete_owner on public.events
  for delete to authenticated using (public.is_owner());

create policy event_overrides_select_owner on public.event_overrides
  for select to authenticated using (public.is_owner());
create policy event_overrides_insert_owner on public.event_overrides
  for insert to authenticated with check (public.is_owner());
create policy event_overrides_update_owner on public.event_overrides
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy event_overrides_delete_owner on public.event_overrides
  for delete to authenticated using (public.is_owner());

create policy reminders_select_owner on public.reminders
  for select to authenticated using (public.is_owner());
create policy reminders_insert_owner on public.reminders
  for insert to authenticated with check (public.is_owner());
create policy reminders_update_owner on public.reminders
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy reminders_delete_owner on public.reminders
  for delete to authenticated using (public.is_owner());

create policy push_subscriptions_select_owner on public.push_subscriptions
  for select to authenticated using (public.is_owner());
create policy push_subscriptions_insert_owner on public.push_subscriptions
  for insert to authenticated with check (public.is_owner());
create policy push_subscriptions_update_owner on public.push_subscriptions
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy push_subscriptions_delete_owner on public.push_subscriptions
  for delete to authenticated using (public.is_owner());

create policy capture_jobs_select_owner on public.capture_jobs
  for select to authenticated using (public.is_owner());
create policy capture_jobs_insert_owner on public.capture_jobs
  for insert to authenticated with check (public.is_owner());
create policy capture_jobs_update_owner on public.capture_jobs
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy capture_jobs_delete_owner on public.capture_jobs
  for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------------------
-- Grants. Supabase's default privileges already cover these; stated so this
-- file is the whole truth. RLS, not grants, is what refuses.

grant select, insert, update, delete on all tables in schema public
  to authenticated;
grant select on all tables in schema public to anon;
