-- CIC Merch Review — Supabase setup (run once in Supabase > SQL Editor > New query > Run)
-- This is the target schema for a FRESH Supabase project only. The live project already has an
-- older, single-client version of this schema — for that one, run migrate_add_clients.sql instead,
-- which upgrades it in place without touching existing data.
--
-- Creates: the approved-reviewer list (now scoped per client), one shared storage table for every
-- client's site (items, decisions, samples, layouts), and security rules so only approved, signed-in
-- people can read or save anything — and only for the client(s) they're approved for.

create table if not exists public.allowed_users (
  email   text primary key,
  name    text,
  role    text not null default 'reviewer' check (role in ('reviewer','admin')),
  clients text[] not null default '{}'   -- client codes this reviewer can see, e.g. '{FND}' or '{FND,MOV}'; ignored for admins
);

create table if not exists public.kv (
  client     text not null,              -- client code, e.g. 'FND', 'MOV' — keeps every client's rows apart
  collection text not null,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (client, collection, id)
);
create index if not exists kv_client_coll_updated on public.kv (client, collection, updated_at);

-- who is signing in (null = not on the list)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.allowed_users where email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- which client codes this signed-in person is approved to see (empty for admins — they see everything)
create or replace function public.my_clients() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select clients from public.allowed_users where email = lower(coalesce(auth.jwt() ->> 'email', ''))), '{}')
$$;

-- stamp every save with the time and the signed-in email
create or replace function public.kv_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := lower(coalesce(auth.jwt() ->> 'email', new.updated_by));
  return new;
end $$;
drop trigger if exists kv_stamp on public.kv;
create trigger kv_stamp before insert or update on public.kv for each row execute function public.kv_stamp();

alter table public.allowed_users enable row level security;
alter table public.kv enable row level security;

drop policy if exists "see own row or admin" on public.allowed_users;
create policy "see own row or admin" on public.allowed_users for select to authenticated
  using (email = lower(auth.jwt() ->> 'email') or public.my_role() = 'admin');

drop policy if exists "approved can read" on public.kv;
create policy "approved can read" on public.kv for select to authenticated
  using (public.my_role() is not null and (public.my_role() = 'admin' or client = any(public.my_clients())));

drop policy if exists "approved can add" on public.kv;
create policy "approved can add" on public.kv for insert to authenticated
  with check (
    public.my_role() is not null and (collection <> 'site' or public.my_role() = 'admin')
    and (public.my_role() = 'admin' or client = any(public.my_clients()))
  );

drop policy if exists "approved can change" on public.kv;
create policy "approved can change" on public.kv for update to authenticated
  using (
    public.my_role() is not null and (collection <> 'site' or public.my_role() = 'admin')
    and (public.my_role() = 'admin' or client = any(public.my_clients()))
  )
  with check (
    public.my_role() is not null and (collection <> 'site' or public.my_role() = 'admin')
    and (public.my_role() = 'admin' or client = any(public.my_clients()))
  );

drop policy if exists "admin can delete" on public.kv;
create policy "admin can delete" on public.kv for delete to authenticated
  using (public.my_role() = 'admin');

revoke all on public.kv, public.allowed_users from anon;
grant select, insert, update, delete on public.kv to authenticated;
grant select on public.allowed_users to authenticated;

-- ===== Approved people (edit this list any time and re-run just these lines) =====
-- Admins (CIC staff) see every client and need no clients array:
insert into public.allowed_users (email, name, role) values
  ('admin.email@example.com', 'Site Admin', 'admin')  -- replace with the admin's sign-in email
on conflict (email) do update set name = excluded.name, role = excluded.role;

-- Reviewers are scoped to one or more client codes (use their exact email, lowercase):
-- insert into public.allowed_users (email, name, role, clients) values
--   ('first.last@example.com', 'First Last', 'reviewer', array['FND'])
-- on conflict (email) do update set name = excluded.name, role = excluded.role, clients = excluded.clients;

-- Remove someone:
-- delete from public.allowed_users where email = 'first.last@example.com';
