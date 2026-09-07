const encoder = new TextEncoder();
const SESSION_COOKIE = "dbstudio_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type AdminSecrets = {
	ADMIN_PASSWORD_HASH?: string;
	ADMIN_SESSION_SECRET?: string;
};

const base64Url = (bytes: ArrayBuffer): string =>
	btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

const fromBase64 = (value: string): Uint8Array => {
	const binary = atob(value);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index += 1) {
		difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
	}
	return difference === 0;
};

const hmac = async (value: string, secret: string): Promise<string> => {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return base64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
};

/** Workers rejects PBKDF2 derivations above 100k iterations at runtime. */
const PBKDF2_ITERATIONS = 100_000;

const deriveBits = async (
	password: string,
	salt: Uint8Array,
	iterations: number,
): Promise<ArrayBuffer> => {
	const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
		"deriveBits",
	]);
	return crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
		key,
		256,
	);
};

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

/**
 * Fields are colon-separated: `$` would be swallowed by dotenv expansion when the
 * hash is stored in `.env` and uploaded by Wrangler.
 */
export const hashAdminPassword = async (password: string): Promise<string> => {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const derived = await deriveBits(password, salt, PBKDF2_ITERATIONS);
	return `pbkdf2_sha256:${PBKDF2_ITERATIONS}:${toBase64(salt)}:${toBase64(new Uint8Array(derived))}`;
};

export const verifyAdminPassword = async (
	password: string,
	secrets: AdminSecrets,
): Promise<boolean> => {
	try {
		const encoded = secrets.ADMIN_PASSWORD_HASH;
		if (!encoded) return false;
		const [algorithm, rawIterations, salt, expected] = encoded.split(":");
		const iterations = Number(rawIterations);
		if (
			algorithm !== "pbkdf2_sha256" ||
			iterations !== PBKDF2_ITERATIONS ||
			!salt ||
			!expected
		) {
			return false;
		}
		const actual = await deriveBits(password, fromBase64(salt), iterations);
		return constantTimeEqual(new Uint8Array(actual), fromBase64(expected));
	} catch {
		return false;
	}
};

export const createAdminSessionCookie = async (
	secrets: AdminSecrets,
): Promise<string | null> => {
	if (!secrets.ADMIN_SESSION_SECRET) return null;
	const expiresAt = Math.floor(Date.now() / 1_000) + SESSION_TTL_SECONDS;
	const payload = String(expiresAt);
	const signature = await hmac(payload, secrets.ADMIN_SESSION_SECRET);
	return `${SESSION_COOKIE}=${payload}.${signature}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
};

const readCookie = (request: Request, name: string): string | undefined =>
	request.headers
		.get("cookie")
		?.split(";")
		.map((part) => part.trim().split("="))
		.find(([key]) => key === name)?.[1];

export const hasValidAdminSession = async (
	request: Request,
	secrets: AdminSecrets,
): Promise<boolean> => {
	if (!secrets.ADMIN_SESSION_SECRET) return false;
	const value = readCookie(request, SESSION_COOKIE);
	if (!value) return false;
	const [expiresAt, signature] = value.split(".");
	if (!expiresAt || !signature || Number(expiresAt) <= Date.now() / 1_000) return false;
	const expected = await hmac(expiresAt, secrets.ADMIN_SESSION_SECRET);
	return constantTimeEqual(encoder.encode(signature), encoder.encode(expected));
};

export const clearAdminSessionCookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
