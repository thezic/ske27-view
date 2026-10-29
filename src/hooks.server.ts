import type { Handle } from '@sveltejs/kit/hooks';
import { config } from '#lib/server/config';
import { SESSION_COOKIE, verifySession } from '#lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	const secret = config().SESSION_SECRET ?? '';
	event.locals.authenticated = !!secret && (await verifySession(event.cookies.get(SESSION_COOKIE), secret));

	if (!event.locals.authenticated && event.url.pathname !== '/login') {
		if (event.url.pathname.startsWith('/api/')) return new Response('Unauthorized', { status: 401 });
		return new Response(null, { status: 303, headers: { location: '/login' } });
	}
	return resolve(event);
};
