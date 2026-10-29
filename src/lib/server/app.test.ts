import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect, isActionFailure } from '@sveltejs/kit';
import { handle } from '../../hooks.server';
import * as loginPage from '../../routes/login/+page.server';
import * as servantsApi from '../../routes/api/servants/+server';

const env = vi.hoisted(() => ({}) as Record<string, string>);
vi.mock('../../lib/server/config', () => ({ config: () => env }));

const ENV = { APP_PASSWORD: 'hemligt', SESSION_SECRET: 'secret-one' };
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
		const unconfigured = { APP_PASSWORD: '', SESSION_SECRET: 'secret-one' };
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
	it('returns a JSON array of servants with optional fields omitted rather than null', async () => {
		const res = await request('/api/servants', { cookie: await login() });
		expect(res.status).toBe(200);
		const servants = res.json as Record<string, unknown>[];
		expect(Array.isArray(servants)).toBe(true);
		expect(servants.length).toBeGreaterThanOrEqual(4);
		for (const s of servants) {
			expect(typeof s.id).toBe('string');
			expect(typeof s.name).toBe('string');
			expect(s.currentLocation).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
			for (const key of ['destination', 'photoUrl']) {
				if (key in s) expect(s[key]).not.toBeNull();
			}
		}
	});

	it('covers every combination of photo and destination being present or missing', async () => {
		const servants = (await request('/api/servants', { cookie: await login() })).json as Record<string, unknown>[];
		const combos = new Set(servants.map((s) => `${'photoUrl' in s}/${'destination' in s}`));
		expect(combos).toEqual(new Set(['true/true', 'true/false', 'false/true', 'false/false']));
	});

	it('moves the servants over time', async () => {
		const cookie = await login();
		const at = async () => (await request('/api/servants', { cookie })).json as { currentLocation: unknown }[];
		const before = await at();
		vi.setSystemTime(Date.now() + 60_000);
		const after = await at();
		expect(after.map((s) => s.currentLocation)).not.toEqual(before.map((s) => s.currentLocation));
	});
});
