# ske27-view

A password-protected live map of Servants during the Move. See `GLOSSARY.md` for terms.
SvelteKit (Svelte 5) + Leaflet, deployed to Cloudflare Workers.

## Setup

```sh
pnpm install
cp .dev.vars.example .dev.vars   # then edit the two values
pnpm dev
```

Two secrets are needed:

| Name             | Purpose                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `APP_PASSWORD`   | The shared password on the login page.                               |
| `SESSION_SECRET` | Signs the session cookie. Use a long random string (`openssl rand -hex 32`). |

**Locally** they live in `.dev.vars` (git-ignored).

**In Cloudflare** they are Worker secrets:

```sh
pnpm exec wrangler secret put APP_PASSWORD
pnpm exec wrangler secret put SESSION_SECRET
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
| `pnpm deploy`  | Build and deploy to Cloudflare Workers        |

## Data

`GET /api/servants` returns a JSON array of Servants (see `src/lib/servant.ts`).
It is served by `getServants()` in `src/lib/server/servants.ts`, which currently returns
moving mock data. Replace its body to read from a database; nothing else needs to change.
