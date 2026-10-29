import { env } from 'cloudflare:workers';

/** App secrets: `.dev.vars` locally, Worker secrets in production. */
export const config = () => env as unknown as { APP_PASSWORD: string; SESSION_SECRET: string; CARTO_API_KEY: string };
