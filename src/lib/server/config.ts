import { env } from 'cloudflare:workers';

/** The two secrets: `.dev.vars` locally, Worker secrets in production. */
export const config = () => env as unknown as { APP_PASSWORD: string; SESSION_SECRET: string };
