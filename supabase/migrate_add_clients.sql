-- Merch Review — add client separation (run ONCE in Supabase > SQL Editor)
-- This turns the single Floor & Decor database into a shared, multi-client one: every row is tagged
-- with a client code (FND, MOV, ...) and a reviewer can only ever read/write their own client's rows,
-- even if they know another client's collection/id or open the browser console.
--
-- Safe to run against the live database: it only adds columns/backfills/updates policies, it does not
-- touch or delete any existing Floor & Decor data. Review it once, then run the whole file.
-- Recommended: run during low traffic and have someone sign in as an F&D reviewer right after to confirm
-- nothing changed for them before sending the Movement link to anyone.

alter table public.kv add column if not exists client text not null default 'FND';
alter table public.allowed_users add column if not exists clients text[] not null default '{}';

-- Existing reviewers were all Floor & Decor reviewers; give them explicit FND access.
-- (Admins are unaffected — admin already bypasses the client check below.)
update public.allowed_users set clients = array['FND'] where role = 'reviewer' and clients = '{}';

-- client becomes part of the row's identity, so FND and MOV (and future clients) can each have their
-- own 'site/bundle' row, their own 'decisions', etc. without colliding.
alter table public.kv drop constraint if exists kv_pkey;
alter table public.kv add primary key (client, collection, id);
drop index if exists kv_coll_updated;
create index if not exists kv_client_coll_updated on public.kv (client, collection, updated_at);

create or replace function public.my_clients() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select clients from public.allowed_users where email = lower(coalesce(auth.jwt() ->> 'email', ''))),
    '{}'
  )
$$;

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

-- delete policy (admin-only) is unchanged — CIC admins can manage any client's data.

-- ===== Add Movement Mortgage reviewers (edit and run any time) =====
-- insert into public.allowed_users (email, name, role, clients) values
--   ('first.last@movement.com', 'First Last', 'reviewer', array['MOV'])
-- on conflict (email) do update set name = excluded.name, role = excluded.role, clients = excluded.clients;

-- ===== Give a CIC admin access notes =====
-- Admins (role = 'admin') already see every client, no clients array needed. To add a new admin:
-- insert into public.allowed_users (email, name, role) values
--   ('person@corp-imaging.com', 'Person Name', 'admin')
-- on conflict (email) do update set name = excluded.name, role = excluded.role;
