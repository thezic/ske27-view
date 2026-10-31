# ske27-view

A password-protected live map of Servants during the Move. See `GLOSSARY.md` for terms.
SvelteKit (Svelte 5) + Leaflet, deployed to Cloudflare Workers.

## Setup

```sh
pnpm install
cp .dev.vars.example .dev.vars   # then fill in the values
pnpm dev
```

Five secrets are needed:

| Name             | Purpose                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `APP_PASSWORD`   | The shared password on the login page.                               |
| `SESSION_SECRET` | Signs the session cookie. Use a long random string (`openssl rand -hex 32`). |
| `CARTO_API_KEY`  | Free CARTO Basemaps key for the map tiles, from <https://carto.com/basemaps/apikey>. Sent to the browser as part of the tile URLs. |
| `SUPABASE_URL`   | The Supabase project URL. |
| `SUPABASE_SECRET_KEY` | Supabase secret key, used only on the server. The publishable key cannot read `event_private`. |

**Locally** they live in `.dev.vars` (git-ignored).

**In Cloudflare** they are Worker secrets:

```sh
pnpm exec wrangler secret put APP_PASSWORD
pnpm exec wrangler secret put SESSION_SECRET
pnpm exec wrangler secret put CARTO_API_KEY
pnpm exec wrangler secret put SUPABASE_URL
pnpm exec wrangler secret put SUPABASE_SECRET_KEY
```

Sessions last 30 days and there is no logout. To log everyone out (e.g. if the password leaks),
change the password and rotate `SESSION_SECRET`.

## Commands

| Command        | What it does                                  |
| -------------- | --------------------------------------------- |
| `pnpm dev`     | Dev server                                    |
| `pnpm test`    | Vitest                                        |
| `pnpm check`   | Type-check                                    |
| `pnpm preview` | Build and run in the local Workers runtime    |
| `pnpm run deploy` | Build and deploy to Cloudflare Workers        |

## Data

`GET /api/servants` returns a JSON array of Servants (see `src/lib/servant.ts`).
It is served by `getServants()` in `src/lib/server/servants.ts`, which reads Supabase and never writes to it:

- `events` gives the Servant: `id` and `couple_names`. Rows with `deleted_at` set are left out.
- `event_private.actual_latitude` / `actual_longitude` (one row per event) is the Destination.
- `event_private.home_latitude` / `home_longitude` (nullable) is the Current location.
- Servants with neither location are left out.
