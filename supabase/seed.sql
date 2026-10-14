-- CAL-004: the local owner. The hosted project's row is set by CAL-030.
-- Kinds are seeded by the client on first sign-in (CAL-006), not here.
insert into public.app_config (owner_email) values ('owner@example.com');
