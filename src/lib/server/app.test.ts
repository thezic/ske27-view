import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect, isActionFailure } from '@sveltejs/kit';
import { handle } from '../../hooks.server';
import * as loginPage from '../../routes/login/+page.server';
import * as servantsApi from '../../routes/api/servants/+server';

const env = vi.hoisted(() => ({}) as Record<string, string>);
vi.mock('../../lib/server/config', () => ({ config: () => env }));

/** A stand-in for Supabase: records the query and answers with `db.rows`, or `db.error`. */
const db = vi.hoisted(() => ({
	rows: [] as unknown[],
	error: null as { message: string } | null,
	client: undefined as unknown as [string, string],
	query: [] as unknown[][]
}));
vi.mock('@supabase/supabase-js', () => ({
	createClient: (url: string, key: string) => {
		db.client = [url, key];
		const builder = {
			from: (...args: unknown[]) => (db.query.push(['from', ...args]), builder),
			select: (...args: unknown[]) => (db.query.push(['select', ...args]), builder),
			is: (...args: unknown[]) => (db.query.push(['is', ...args]), builder),
			then: (resolve: (r: unknown) => unknown) => resolve({ data: db.error ? null : db.rows, error: db.error })
		};
		return builder;
	}
}));

const ENV = {
	APP_PASSWORD: 'hemligt',
	SESSION_SECRET: 'secret-one',
	SUPABASE_URL: 'https://db.test',
	SUPABASE_SECRET_KEY: 'sb-secret'
};
const DAY = 24 * 60 * 60 * 1000;

type Result = {
	status: number;
	location?: string;
	json?: unknown;
	formError?: string;
	setCookie?: { name: string; value: string; options: Record<string, unknown> };
};

/** Sends a request through the session hook and the real routes, like the framework would. */
async function request(
	path: string,
	init: { method?: string; password?: string; cookie?: string; env?: typeof ENV } = {}
): Promise<Result> {
	const form = new FormData();
	if (init.password !== undefined) form.set('password', init.password);
	const req = new Request(`https://app.test${path}`, {
		method: init.method ?? 'GET',
		headers: init.cookie ? { cookie: `session=${init.cookie}` } : {},
		body: init.method === 'POST' ? form : undefined
	});
	Object.assign(env, init.env ?? ENV);
	let setCookie: Result['setCookie'];
	const cookies = {
		get: (name: string) => (name === 'session' ? init.cookie : undefined),
		set: (name: string, value: string, options: Record<string, unknown>) => {
			setCookie = { name, value, options };
		}
	};
	const event = {
		request: req,
		url: new URL(req.url),
		cookies,
		locals: {}
	} as never as Parameters<typeof handle>[0]['event'];

	const route = async (): Promise<Response> => {
		try {
			const e = event as never as Parameters<typeof loginPage.load>[0];
			if (path === '/login' && req.method === 'GET') {
				await loginPage.load(e);
				return new Response('login form');
			}
			if (path === '/login') {
				const out = await loginPage.actions.default(e as never);
				if (isActionFailure(out)) {
					return Response.json({ error: (out.data as unknown as { error: string }).error }, { status: out.status });
				}
				return new Response(null, { status: 200 });
			}
			if (path === '/api/servants') return await servantsApi.GET(e as never);
			return new Response('map page');
		} catch (e) {
			if (isRedirect(e)) return new Response(null, { status: e.status, headers: { location: e.location } });
			throw e;
		}
	};

	const res = await handle({ event, resolve: route } as never);
	const body = res.headers.get('content-type')?.includes('json') ? await res.json() : undefined;
	return {
		status: res.status,
		location: res.headers.get('location') ?? undefined,
		json: body,
		formError: (body as { error?: string } | undefined)?.error,
		setCookie
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
	Object.assign(db, { rows: [], error: null, query: [] });
});
afterEach(() => vi.useRealTimers());

async function login(env = ENV) {
	const res = await request('/login', { method: 'POST', password: env.APP_PASSWORD, env });
	return res.setCookie!.value;
}

describe('login', () => {
	it('sets a 30-day HttpOnly session cookie and redirects to the map on the correct password', async () => {
		const res = await request('/login', { method: 'POST', password: 'hemligt' });
		expect(res.status).toBe(303);
		expect(res.location).toBe('/');
		expect(res.setCookie?.options).toMatchObject({
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			path: '/',
			maxAge: 30 * 24 * 60 * 60
		});
	});

	it('shows "Fel lösenord" and sets no cookie on a wrong password', async () => {
		const res = await request('/login', { method: 'POST', password: 'fel' });
		expect(res.status).toBe(400);
		expect(res.formError).toBe('Fel lösenord');
		expect(res.setCookie).toBeUndefined();
	});

	it('refuses everyone when the app is not configured with a password', async () => {
		const unconfigured = { ...ENV, APP_PASSWORD: '' };
		const res = await request('/login', { method: 'POST', password: '', env: unconfigured });
		expect(res.status).toBe(400);
		expect(res.setCookie).toBeUndefined();
	});

	it('redirects a logged-in visitor from the login page to the map', async () => {
		const res = await request('/login', { cookie: await login() });
		expect(res.status).toBe(303);
		expect(res.location).toBe('/');
	});

	it('shows the login form to a visitor without a session', async () => {
		expect((await request('/login')).status).toBe(200);
	});
});

describe('access guard', () => {
	it('redirects the map page to login without a session', async () => {
		const res = await request('/');
		expect(res.status).toBe(303);
		expect(res.location).toBe('/login');
	});

	it('serves the map page with a valid session', async () => {
		expect((await request('/', { cookie: await login() })).status).toBe(200);
	});

	it('responds 401 from the data endpoint without a session', async () => {
		expect((await request('/api/servants')).status).toBe(401);
	});

	it('treats an expired cookie as no session', async () => {
		const cookie = await login();
		vi.setSystemTime(Date.now() + 31 * DAY);
		expect((await request('/api/servants', { cookie })).status).toBe(401);
		expect((await request('/', { cookie })).location).toBe('/login');
	});

	it('still accepts a cookie shortly before it expires', async () => {
		const cookie = await login();
		vi.setSystemTime(Date.now() + 29 * DAY);
		expect((await request('/api/servants', { cookie })).status).toBe(200);
	});

	it('treats a tampered cookie as no session', async () => {
		const cookie = await login();
		const [expiry, sig] = cookie.split('.');
		const forged = `${Number(expiry) + 365 * DAY}.${sig}`;
		expect((await request('/api/servants', { cookie: forged })).status).toBe(401);
	});

	it('treats a cookie signed with another secret as no session', async () => {
		const cookie = await login({ ...ENV, SESSION_SECRET: 'secret-two' });
		expect((await request('/api/servants', { cookie })).status).toBe(401);
	});

	it('treats garbage cookies as no session', async () => {
		for (const cookie of ['', 'abc', 'x.y', '.']) {
			expect((await request('/api/servants', { cookie })).status).toBe(401);
		}
	});
});

describe('GET /api/servants', () => {
	type Coords = [number | null, number | null];
	const event = (id: string, name: string, [lat, lng]: Coords, [homeLat, homeLng]: Coords = [null, null]) => ({
		id,
		couple_names: name,
		event_private: { actual_latitude: lat, actual_longitude: lng, home_latitude: homeLat, home_longitude: homeLng }
	});

	it('reads non-deleted events with their destination, using the secret key', async () => {
		await request('/api/servants', { cookie: await login() });
		expect(db.client).toEqual(['https://db.test', 'sb-secret']);
		expect(db.query).toEqual([
			['from', 'events'],
			['select', 'id, couple_names, event_private(actual_latitude, actual_longitude, home_latitude, home_longitude)'],
			['is', 'deleted_at', null]
		]);
	});

	it('maps each event to a servant whose destination is the actual location', async () => {
		db.rows = [event('e1', 'Anna & Erik', [57.7, 11.97]), event('e2', 'Olof', [59.33, 18.07])];
		const res = await request('/api/servants', { cookie: await login() });
		expect(res.status).toBe(200);
		expect(res.json).toEqual([
			{ id: 'e1', name: 'Anna & Erik', destination: { lat: 57.7, lng: 11.97 } },
			{ id: 'e2', name: 'Olof', destination: { lat: 59.33, lng: 18.07 } }
		]);
	});

	it('uses the home address as the current location, with or without a destination', async () => {
		db.rows = [
			event('e1', 'Anna & Erik', [57.7, 11.97], [59.33, 18.07]),
			event('e2', 'Olof', [null, null], [62.39, 17.31]),
			event('e3', 'Half a home', [55.6, 13.0], [62.39, null])
		];
		const res = await request('/api/servants', { cookie: await login() });
		expect(res.json).toEqual([
			{ id: 'e1', name: 'Anna & Erik', currentLocation: { lat: 59.33, lng: 18.07 }, destination: { lat: 57.7, lng: 11.97 } },
			{ id: 'e2', name: 'Olof', currentLocation: { lat: 62.39, lng: 17.31 } },
			{ id: 'e3', name: 'Half a home', destination: { lat: 55.6, lng: 13.0 } }
		]);
	});

	it('leaves out events with nothing to place on the map', async () => {
		db.rows = [
			event('e1', 'Anna & Erik', [57.7, 11.97]),
			{ id: 'e2', couple_names: 'No private row', event_private: null },
			event('e3', 'No coordinates', [null, null]),
			event('e4', 'Half a coordinate', [57.7, null], [null, 18.07])
		];
		const servants = (await request('/api/servants', { cookie: await login() })).json as { id: string }[];
		expect(servants.map((s) => s.id)).toEqual(['e1']);
	});

	it('fails rather than returning an empty map when the database errors', async () => {
		db.error = { message: 'boom' };
		await expect(request('/api/servants', { cookie: await login() })).rejects.toThrow('boom');
	});
});
