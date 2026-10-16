-- CAL-032: is_owner() refuses a blank claim when the configured owner is
-- blank. 0001 tested the claim for emptiness BEFORE trimming, so a claim of
-- '   ' against an owner_email of '' compared '' with '' and was admitted.
-- Both sides are normalised first, then both must be non-empty and equal -
-- the same rule as CAL-003's isOwnerEmail. Same OID, same grants: the
-- policies' rendered `is_owner()` is untouched.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select claim <> '' and owner <> '' and claim = owner
  from (
    select
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) as claim,
      lower(trim(coalesce(
        (select owner_email from public.app_config limit 1), ''))) as owner
  ) as sides
$$;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated, service_role;
