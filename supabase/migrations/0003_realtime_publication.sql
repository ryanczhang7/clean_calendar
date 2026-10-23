-- CAL-016: the four client tables stream over Realtime; app_config and
-- push_subscriptions do not. RLS applies to the stream as to reads.
alter publication supabase_realtime add table
  public.events, public.event_overrides, public.kinds, public.reminders;
