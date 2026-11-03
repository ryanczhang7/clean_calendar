-- CAL-026 Block 1: a reminder is cleared by a soft delete, so the clear
-- reaches other devices through Realtime and catch-up (updated_at moves).
-- The unique key (event_id, occurrence_date) is unchanged: a cleared
-- template keeps it, and setting a reminder again restores that row.
alter table public.reminders add column deleted_at timestamptz;
