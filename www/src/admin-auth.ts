// Password login for /admin: the login form posts ADMIN_PASSWORD and gets a session cookie back.

const SESSION_COOKIE = "dbstudio_admin";
const SESSION_SECONDS = 30 * 86_400;
const encoder = new TextEncoder();

/** Compares every byte, so the time taken does not reveal how much of a guess was right. */
const sameBytes = (a: Uint8Array, b: Uint8Array) =>
	a.length === b.length && a.reduce((diff, byte, i) => diff | (byte ^ b[i]), 0) === 0;

const sha256 = async (text: string) =>
	new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));

/** The cookie value: an HMAC keyed by the password, so changing the password ends every session. */
async function sessionToken(password: string) {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = await crypto.subtle.sign("HMAC", key, encoder.encode("db-studio admin session"));
	return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

const sessionCookie = (value: string, maxAge: number) =>
	`${SESSION_COOKIE}=${value}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

const readCookie = (request: Request) =>
	request.headers
		.get("cookie")
		?.split(";")
		.map((c) => c.trim())
		.find((c) => c.startsWith(`${SESSION_COOKIE}=`))
		?.slice(SESSION_COOKIE.length + 1) ?? "";

const seeOther = (location: string, cookie?: string) =>
	new Response(null, {
		status: 303,
		// Relative, so it stays on the host the browser used (the dev proxy rewrites request.url).
		headers: cookie ? { location, "set-cookie": cookie } : { location },
	});

/** Answers an /admin request that is not signed in, or a login or logout; null lets it through. */
export async function guardAdmin(request: Request, password: string | undefined) {
	// Without a password set there is no admin.
	if (!password) return new Response("Not found", { status: 404 });

	const { pathname } = new URL(request.url);
	const isPost = request.method === "POST";

	// Writes must come from this site's own pages, never from a form on another site.
	const site = request.headers.get("sec-fetch-site");
	if (isPost && site && site !== "same-origin")
		return new Response("Forbidden", { status: 403 });

	if (pathname === "/admin/login") {
		if (!isPost) return null;
		const form = await request.formData();
		const given = await sha256(String(form.get("password") ?? ""));
		if (!sameBytes(given, await sha256(password))) {
			// Slows down guessing.
			await new Promise((resolve) => setTimeout(resolve, 1000));
			return seeOther("/admin/login?error=1");
		}
		return seeOther("/admin", sessionCookie(await sessionToken(password), SESSION_SECONDS));
	}

	if (pathname === "/admin/logout" && isPost) {
		return seeOther("/admin/login", sessionCookie("", 0));
	}

	const token = await sessionToken(password);
	if (sameBytes(encoder.encode(readCookie(request)), encoder.encode(token))) return null;
	return isPost ? new Response("Sign in first", { status: 401 }) : seeOther("/admin/login");
}
