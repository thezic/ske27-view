import { config } from '#lib/server/config';
import type { PageServerLoad } from './$types';

/** Tiles are fetched by the browser, so the key reaches the client; it is only kept out of the repo. */
export const load: PageServerLoad = () => ({ cartoApiKey: config().CARTO_API_KEY });
