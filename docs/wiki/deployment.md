# Deployment

How Clean Calendar reaches production, and the one-time setup it needs.

Every push to `main` runs `.github/workflows/deploy.yml`: install, the fast
gates (`bash scripts/gates.sh --fast`), the production build, then
`supabase db push` and `supabase functions deploy` against the hosted project,
and finally `dist/` to Cloudflare Pages. Schema and functions go before the
client, so a failed migration stops the run before the client changes. A pull
request runs nothing from that workflow. It can also be started by hand from
the Actions tab (**deploy** → **Run workflow**, branch `main`).

This guide carries **names, never values**. Everything in angle brackets
(`<project-ref>`, `<pages-origin>`, `<owner-email>`) is yours to substitute
where you type it into a dashboard; none of it is ever committed.
`src/deploy/noSecrets.test.ts` scans every tracked file, this one included,
for a secret value.

Do the steps in order: later steps use values the earlier ones produce.

## 1. Create the Supabase project and its database password

1. In the [Supabase dashboard](https://supabase.com/dashboard), **New project**,
   on the free plan. Pick the region nearest you.
2. Supabase asks for a **database password** at creation. Generate one and
   keep it in your password manager: it becomes the `SUPABASE_DB_PASSWORD`
   secret in step 7, and the deploy needs it for `supabase db push`.
3. Note the **project ref**: the `<project-ref>` part of
   `https://<project-ref>.supabase.co`, also shown under Project Settings →
   General. It becomes the `SUPABASE_PROJECT_REF` variable.

To reset the database password later: **Database → Settings** (Database
password → Reset), or press Ctrl+K in the dashboard and search
"reset database password". After a reset, update the `SUPABASE_DB_PASSWORD`
secret in step 7 too, or the next deploy fails at the Push migrations step.

## 2. Create the Cloudflare Pages project by direct upload

The workflow uploads the built `dist/` itself, so Cloudflare must not build
from Git.

1. In the Cloudflare dashboard: **Workers & Pages → Create**.
2. Choose the **Pages** tab, then **"Continue to Pages"** → **"Upload assets"**.
   Not "Connect to Git" (Cloudflare would then build the repository itself,
   without the production variables), and not a Worker.
3. Name the project. The name is `<pages-project>`, it becomes the
   `CLOUDFLARE_PAGES_PROJECT` variable, and the site's origin is
   `https://<pages-project>.pages.dev` - called `<pages-origin>` below.
4. Cloudflare asks for a first upload to finish creating the project. Upload
   any small folder (a single `index.html` is enough); the first real deploy
   replaces it. The project's production branch is `main`, which is what the
   workflow deploys with `--branch=main`.

No `_redirects` file is needed: with no top-level `404.html` in the upload,
Pages serves `index.html` for every client route. `public/_headers` gives
`/sw.js` and `/manifest.webmanifest` `Cache-Control: no-cache`, so a new
service worker is picked up on the next visit.

## 3. Set up Google sign-in

In the [Google Cloud console](https://console.cloud.google.com/):

1. Create (or pick) a project for the app.
2. **Google Auth Platform → Audience** (older consoles: OAuth consent screen):
   user type **External**, publishing status **Testing**, and add your own
   Google account as a **test user**. Only test users can sign in while the
   app is in Testing, which is exactly what a one-account app wants.
3. **Clients → Create client**, type **Web application**:
   - **Authorized JavaScript origin**: `https://<pages-origin>` - the Pages
     origin, with **no trailing slash** (Google rejects one).
   - **Authorized redirect URI**:
     `https://<project-ref>.supabase.co/auth/v1/callback`
     (Supabase's callback, not the app's).
4. Copy the client ID and client secret into Supabase, not into the
   repository.

In the Supabase dashboard:

5. **Authentication → Sign In / Providers → Google**: enable the
   Google provider and paste the client ID and client secret from item 4.
6. **Authentication → URL Configuration**:
   - **Site URL**: `https://<pages-origin>`
   - **Redirect URLs**: add `https://<pages-origin>/**`

## 4. Set GEMINI_API_KEY as a Supabase function secret

The `capture` function reads the Gemini key from its environment; the browser
never sees it.

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. In the Supabase dashboard: **Edge Functions → Secrets** (Manage secrets),
   add a secret named `GEMINI_API_KEY` with the key as its value.

Or from a terminal with the Supabase CLI logged in to your account:

    pnpm exec supabase secrets set --project-ref <project-ref> GEMINI_API_KEY=<gemini-api-key>

It is a function secret only. It is not a GitHub secret and the deploy
workflow never touches it.

## 5. Create a scoped Supabase access token

The deploy authenticates to Supabase with a personal access token. Scope it to
the least the workflow needs.

1. Supabase dashboard → your account → **Access Tokens** → generate a new
   token, choosing the scoped (fine-grained) kind.
2. Limit it to **one project**: the project from step 1.
3. Grant exactly these permissions:
   - Edge Functions: **read-write** (`supabase functions deploy`)
   - everything else: **none**
4. Copy the token once; Supabase will not show it again. It becomes the
   `SUPABASE_ACCESS_TOKEN` secret in step 7.

The token needs no database permission: migrations are pushed over a direct
Postgres connection (the session pooler) using the database password from
step 1, not through the Supabase API. That `supabase functions deploy
--project-ref` succeeds with this token alone is measured by the first
deploy; if it fails at the Deploy functions step with a permission error, its
log names what was refused.

## 6. Create the Cloudflare API token and find the account ID

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token** →
   **Create Custom Token**.
2. Permissions: Account · Cloudflare Pages · Edit, and nothing else.
3. Account resources: include only your account.
4. Create it and copy it once. It becomes the `CLOUDFLARE_API_TOKEN` secret.
5. The **account ID** is on the Workers & Pages overview (right-hand column,
   "Account ID"), and in the dashboard URL after `dash.cloudflare.com/`. It
   becomes the `CLOUDFLARE_ACCOUNT_ID` secret.

## 7. Create the GitHub production environment

In the repository on GitHub: **Settings → Environments → New environment**,
named `production`.

1. **Deployment branches and tags**: choose "Selected branches and tags" and
   add the branch rule `main`. Only jobs on `main` then receive this
   environment's secrets; a pull request never does.
2. **Environment secrets** (four):

   | Name | Value from |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | step 6 |
   | `CLOUDFLARE_ACCOUNT_ID` | step 6 |
   | `SUPABASE_ACCESS_TOKEN` | step 5 |
   | `SUPABASE_DB_PASSWORD` | step 1 |

3. **Environment variables** (six):

   | Name | Value |
   |---|---|
   | `SUPABASE_PROJECT_REF` | `<project-ref>` from step 1 |
   | `SUPABASE_POOLER_HOST` | the host from Supabase **Connect → Session pooler** (e.g. `aws-0-<region>.pooler.supabase.com`, host only, no password or port) |
   | `CLOUDFLARE_PAGES_PROJECT` | `<pages-project>` from step 2 |
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the project's anon (public) key |
   | `VITE_OWNER_EMAIL` | `<owner-email>`, the Google account you sign in with |

   The anon key is in the Supabase dashboard under **Project Settings → API
   Keys**: the `anon` / public key. It is public by design (it is compiled
   into the bundle, and row-level security does the protecting). **Never use
   the `service_role` key here**: it bypasses row-level security and would
   ship to every browser.

Put nothing at repository level: the workflow reads only from the
`production` environment.

## 8. After the first deploy: set app_config.owner_email

The migrations create `public.app_config` but no row in it (only the local
`supabase/seed.sql` inserts one), and with no row nobody is the owner:
`public.is_owner()` returns false and every table is closed. The table allows
exactly one row (the `singleton` column is unique and must be true).

After the first deploy has applied the migrations, open the Supabase
dashboard → **SQL Editor** and run, with your email in place of
`<owner-email>`:

```sql
insert into public.app_config (owner_email)
values ('<owner-email>')
on conflict (singleton) do update set owner_email = excluded.owner_email;
```

It is safe to re-run, and the same statement changes the owner later. Use the
same address as the `VITE_OWNER_EMAIL` variable in step 7. Then open
`https://<pages-origin>` and sign in with Google.

## 9. Restore a paused free-tier project

Supabase pauses a free-tier project after a period of inactivity. While it is
paused the app cannot sign in or sync, and a deploy fails at the Push migrations step.

To restore it: Supabase dashboard → open the project → **Restore** (the
paused project's page offers it). Restoring takes a few minutes; nothing needs
re-running here afterwards. A paused project can be restored for a limited
window - up to a year, at the time of writing. That is Supabase's policy, not
a promise from this guide: the paused project's page in the dashboard shows
the current deadline, so check it there and restore before it passes.

## Later (CAL-028)

Reminders (CAL-028) add their own one-time steps, not part of this story:

- a VAPID key pair, set as three function secrets: `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`;
- the Supabase Vault entries the reminder cron reads to call
  `send-reminders`.

CAL-028's story says how to create each. `send-reminders` itself needs no
change to the workflow: `supabase functions deploy` deploys every function.
