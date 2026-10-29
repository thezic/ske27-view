import { json } from '@sveltejs/kit';
import { getServants } from '#lib/server/servants';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json(await getServants());
