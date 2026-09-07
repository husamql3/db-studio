import { describe, expect, it } from "vitest";
import {
	createAdminSessionCookie,
	hashAdminPassword,
	hasValidAdminSession,
	verifyAdminPassword,
} from "./auth";

describe("admin authentication", () => {
	it("accepts a signed session and rejects a tampered session", async () => {
		const secrets = { ADMIN_SESSION_SECRET: "a-test-secret-that-is-long-enough" };
		const cookie = await createAdminSessionCookie(secrets);
		expect(cookie).not.toBeNull();
		const value = cookie?.split(";")[0] ?? "";
		expect(
			await hasValidAdminSession(
				new Request("https://dbstudio.sh/admin", { headers: { cookie: value } }),
				secrets,
			),
		).toBe(true);
		expect(
			await hasValidAdminSession(
				new Request("https://dbstudio.sh/admin", { headers: { cookie: `${value}x` } }),
				secrets,
			),
		).toBe(false);
	});

	it("verifies a password against its own hash", async () => {
		const ADMIN_PASSWORD_HASH = await hashAdminPassword("a-long-admin-password");
		expect(await verifyAdminPassword("a-long-admin-password", { ADMIN_PASSWORD_HASH })).toBe(
			true,
		);
		expect(await verifyAdminPassword("a-long-admin-passwore", { ADMIN_PASSWORD_HASH })).toBe(
			false,
		);
	});

	it("encodes the hash without characters that dotenv expansion would strip", async () => {
		expect(await hashAdminPassword("a-long-admin-password")).not.toContain("$");
	});

	it("stays within the PBKDF2 iteration count Workers accepts at runtime", async () => {
		const [, iterations] = (await hashAdminPassword("a-long-admin-password")).split(":");
		expect(Number(iterations)).toBeLessThanOrEqual(100_000);
	});

	it("rejects a hash whose iteration count Workers would refuse to derive", async () => {
		const [algorithm, , salt, expected] = (
			await hashAdminPassword("a-long-admin-password")
		).split(":");
		expect(
			await verifyAdminPassword("a-long-admin-password", {
				ADMIN_PASSWORD_HASH: `${algorithm}:600000:${salt}:${expected}`,
			}),
		).toBe(false);
	});

	it("fails closed when the stored password hash is absent or malformed", async () => {
		expect(await verifyAdminPassword("password", {})).toBe(false);
		expect(
			await verifyAdminPassword("password", { ADMIN_PASSWORD_HASH: "not-a-supported-hash" }),
		).toBe(false);
		expect(
			await verifyAdminPassword("password", {
				ADMIN_PASSWORD_HASH: "pbkdf2_sha256:100000:%%%:%%%",
			}),
		).toBe(false);
	});
});
