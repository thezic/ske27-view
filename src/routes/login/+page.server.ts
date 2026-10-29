import { fail, redirect } from '@sveltejs/kit';
import { config } from '#lib/server/config';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSession, passwordMatches } from '#lib/server/session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.authenticated) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const env = config();
		const password = (await request.formData()).get('password');
		// An unconfigured app fails closed rather than accepting an empty password.
		const configured = !!env.APP_PASSWORD && !!env.SESSION_SECRET;
		if (!configured || typeof password !== 'string' || !(await passwordMatches(password, env.APP_PASSWORD))) {
			return fail(400, { error: 'Fel lösenord' });
		}
		cookies.set(SESSION_COOKIE, await createSession(env.SESSION_SECRET), {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: SESSION_MAX_AGE_SECONDS
		});
		redirect(303, '/');
	}
};
