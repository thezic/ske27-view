export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const encoder = new TextEncoder();

async function hmacKey(secret: string, usage: KeyUsage) {
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

function toHex(bytes: ArrayBuffer) {
	return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string) {
	if (!/^([0-9a-f]{2})+$/.test(hex)) return null;
	return Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16));
}

/** A cookie value holding an expiry timestamp (ms) and its HMAC-SHA256 signature. */
export async function createSession(secret: string, now = Date.now()) {
	const expiry = String(now + SESSION_MAX_AGE_SECONDS * 1000);
	const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(expiry));
	return `${expiry}.${toHex(signature)}`;
}

export async function verifySession(value: string | undefined, secret: string, now = Date.now()) {
	if (!value) return false;
	const [expiry, signature, ...rest] = value.split('.');
	if (rest.length || !/^\d+$/.test(expiry ?? '')) return false;
	const signatureBytes = fromHex(signature ?? '');
	if (!signatureBytes) return false;
	// subtle.verify compares in constant time
	const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), signatureBytes, encoder.encode(expiry));
	return valid && Number(expiry) > now;
}

/** Constant-time string comparison, via equal-length digests. */
export async function passwordMatches(input: string, expected: string) {
	const [a, b] = await Promise.all(
		[input, expected].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s))))
	);
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}
