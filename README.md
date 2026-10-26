# CIC Merch Review

This repo (`jesscole2018-lang.github.io`) owns the `cicmerchreview.com` custom domain (its `CNAME` file),
so every folder here is a true top-level path on that domain. The old `fnd` repo held Floor & Decor's
site before this move and now just redirects `cicmerchreview.com/fnd/` here — any link already sent to
an F&D reviewer keeps working.

One shared reviewer site, one client per folder (named by store code), all under `cicmerchreview.com`:

- `/FND` — Floor & Decor — https://www.cicmerchreview.com/FND
- `/MOV` — Movement Mortgage — https://www.cicmerchreview.com/MOV
- more clients (Nextiva, CHEP, Total Safety, ...) land the same way, one folder each

Hosted on GitHub Pages; sign-in and saved decisions run on one shared Supabase project.

- **No pricing, inventory or decision data is stored in this repository.** Each client's data loads from
  Supabase only after an approved person signs in, and is scoped so one client's reviewers can never see
  another client's data (enforced in the database, not just hidden in the page).
- Shared engine: `boot.js` (sign-in, data loading, storage — one copy at the repo root, used by every
  client folder). Per-client: `<CLIENT>/index.html` (layout, branding, sign-in gate) and
  `<CLIENT>/app.js` (that client's review site).
- Database setup: `supabase/setup.sql` for a brand-new Supabase project. The live project already exists
  in its older, Floor & Decor–only form — `supabase/migrate_add_clients.sql` upgrades it in place to
  support multiple clients, without touching existing data. Run it once, before the first `/MOV`-style
  reviewer signs in.

## Add a new client (e.g. the next one after Movement)
1. Pick its store code, e.g. `NEX` for Nextiva.
2. Copy an existing client folder (e.g. `/MOV`) to `/NEX`, swap in that client's branding, logo
   (`NEX/brand/...`) and product photos (`NEX/img/...`), and set `client:'NEX'` and `storeName` in its
   `index.html`'s `window.SITE_CONFIG`.
3. In Supabase, add its reviewers (see below) — nothing else to change in the database; `client` is just
   another value in the same `kv` table.
4. Sign in as admin at `https://www.cicmerchreview.com/NEX/?import` and load that client's
   INTERNAL ONLY site-data file.

## Add or remove a reviewer
1. Supabase → Authentication → Users → **Add user → Create new user**: enter their email and a temporary password, tick **Auto Confirm User**.
2. Supabase → SQL Editor → run (set `clients` to every client code they should see, e.g. `array['MOV']` or `array['FND','MOV']`):
   ```sql
   insert into public.allowed_users (email, name, role, clients) values ('first.last@example.com','First Last','reviewer',array['MOV'])
   on conflict (email) do update set name = excluded.name, role = excluded.role, clients = excluded.clients;
   ```
3. Send them the site link for their client, their email and the temporary password.

Remove: `delete from public.allowed_users where email = 'first.last@example.com';` (and delete the user under Authentication → Users).

## Update the items / prices / inventory for a client
Sign in as an admin and open that client's folder with `?import` at the end of the address
(e.g. `https://www.cicmerchreview.com/MOV/?import`), then load the new INTERNAL ONLY site-data file from
CIC for that client. Saved decisions are kept.
