-- CAL-028 Block 1 (AC-5): pg_cron posts to the send-reminders edge function
-- every minute through pg_net. The function URL and the service-role JWT are
-- read from Vault by name at each run; the local stack has neither entry, so
-- there the job does nothing. The hosted entries are created once by hand
-- (CAL-028 story, PO decision 2) and never written into this repository.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_send_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_key text;
begin
  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'send_reminders_url';
  select decrypted_secret into fn_key
    from vault.decrypted_secrets where name = 'send_reminders_key';
  if fn_url is null or fn_key is null then
    return;
  end if;
  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || fn_key
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke execute on function public.invoke_send_reminders()
  from public, anon, authenticated;

-- cron.schedule with a job name is an upsert: a re-run leaves one job.
select cron.schedule(
  'send-reminders',
  '* * * * *',
  'select public.invoke_send_reminders()'
);
