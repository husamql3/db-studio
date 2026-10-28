/**
 * The saved-connections file (~/.dbstudio/connections.json) holds database passwords, so it is
 * tested in isolation. Ways it can fail:
 *
 * 1. A password or auth token survives in the masked URL the browser receives.
 * 2. A rotated password creates a second entry instead of updating the first, which keeps the
 *    stale password and loses the user's name and color.
 * 3. Two databases on the same server collapse into one entry because identity ignores the path.
 * 4. A relative SQLite or DuckDB path is saved as given, so it opens another file (or none) when
 *    the CLI starts from a different directory.
 * 5. The file or its directory is readable by other users.
 * 6. A missing file throws instead of reading as an empty list.
 * 7. A default name is unreadable: not `host/database` for a server, not the file name for a file.
 * 8. Two connections recorded at the same moment overwrite each other, losing one.
 * 9. Renaming or deleting an unknown id silently succeeds.
 * 10. A password with an unencoded `@` is masked only up to that `@`, leaking the rest.
 * 11. A percent-encoded parameter name (`%61uthToken`) slips past the mask, though the driver
 *     decodes it and reads the token.
 */
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	defaultConnectionName,
	deleteSavedConnection,
	listSavedConnections,
	maskConnectionUrl,
	normalizeConnectionUrl,
	recordConnection,
	updateSavedConnection,
} from "@/connections-store.js";

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "dbstudio-store-"));
	process.env.DB_STUDIO_CONFIG_DIR = join(dir, ".dbstudio");
});

afterEach(async () => {
	delete process.env.DB_STUDIO_CONFIG_DIR;
	await rm(dir, { recursive: true, force: true });
});

describe("maskConnectionUrl", () => {
	it("hides the password of a user:password URL", () => {
		expect(maskConnectionUrl("postgres://admin:s3cr3t@db.example.com:5432/app")).toBe(
			"postgres://admin:••••@db.example.com:5432/app",
		);
	});

	it("hides a password given without a user", () => {
		expect(maskConnectionUrl("redis://:hunter2@localhost:6379/0")).toBe(
			"redis://:••••@localhost:6379/0",
		);
	});

	it("hides auth tokens and password query parameters", () => {
		expect(
			maskConnectionUrl("libsql://db-org.turso.io?authToken=eyJabc.def&tls=1"),
		).toBe("libsql://db-org.turso.io?authToken=••••&tls=1");
		expect(maskConnectionUrl("d1://acc/db-id?authToken=cf_token")).toBe(
			"d1://acc/db-id?authToken=••••",
		);
		expect(maskConnectionUrl("mssql://sa@host:1433/db?password=P@ss;word")).toBe(
			"mssql://sa@host:1433/db?password=••••",
		);
	});

	it("hides all of a password that contains an unencoded @", () => {
		expect(maskConnectionUrl("postgresql://u:p@ss@host/db?x=a@b")).toBe(
			"postgresql://u:••••@host/db?x=a@b",
		);
	});

	it("hides a secret whose parameter name is percent-encoded", () => {
		expect(maskConnectionUrl("d1://acc/db-id?%61uthToken=cf_token&x=1")).toBe(
			"d1://acc/db-id?%61uthToken=••••&x=1",
		);
		expect(maskConnectionUrl("libsql://db.turso.io?tls=0&%54OKEN=abc")).toBe(
			"libsql://db.turso.io?tls=0&%54OKEN=••••",
		);
	});

	it("leaves a URL without secrets unchanged", () => {
		expect(maskConnectionUrl("sqlite:///Users/me/shop.db")).toBe("sqlite:///Users/me/shop.db");
	});
});

describe("normalizeConnectionUrl", () => {
	it("resolves a relative SQLite or DuckDB path against the working directory", () => {
		expect(normalizeConnectionUrl("sqlite://./data/app.db", "/home/me/project")).toBe(
			"sqlite:///home/me/project/data/app.db",
		);
		expect(normalizeConnectionUrl("duckdb://warehouse.duckdb", "/srv")).toBe(
			"duckdb:///srv/warehouse.duckdb",
		);
	});

	it("keeps absolute paths, in-memory SQLite and server URLs as they are", () => {
		expect(normalizeConnectionUrl("sqlite:///abs/app.db", "/x")).toBe("sqlite:///abs/app.db");
		expect(normalizeConnectionUrl("sqlite://:memory:", "/x")).toBe("sqlite://:memory:");
		expect(normalizeConnectionUrl("  postgres://u:p@h/db  ", "/x")).toBe("postgres://u:p@h/db");
	});
});

describe("defaultConnectionName", () => {
	it("names a server connection host/database", () => {
		expect(defaultConnectionName("postgres://u:p@db.example.com:5432/app")).toBe(
			"db.example.com/app",
		);
		expect(defaultConnectionName("redis://localhost:6379")).toBe("localhost");
	});

	it("names a file connection after the file", () => {
		expect(defaultConnectionName("sqlite:///Users/me/projects/shop.sqlite")).toBe(
			"shop.sqlite",
		);
		expect(defaultConnectionName("duckdb:///data/wh.duckdb")).toBe("wh.duckdb");
	});
});

describe("saved connections file", () => {
	it("reads a missing file as no connections", async () => {
		expect(await listSavedConnections()).toEqual([]);
	});

	it("saves a new connection with a default name and no color", async () => {
		const saved = await recordConnection("postgres://u:p@db.example.com/app");
		expect(saved).toMatchObject({ name: "db.example.com/app", color: null });
		expect(await listSavedConnections()).toEqual([saved]);
	});

	it("updates the same entry when only the password changed, keeping name and color", async () => {
		const first = await recordConnection("postgres://admin:old@db.example.com/app");
		await updateSavedConnection(first.id, { name: "prod", color: "red" });

		const second = await recordConnection("postgres://admin:new@db.example.com/app");

		const all = await listSavedConnections();
		expect(all).toHaveLength(1);
		expect(second.id).toBe(first.id);
		expect(all[0]).toMatchObject({
			name: "prod",
			color: "red",
			url: "postgres://admin:new@db.example.com/app",
		});
	});

	it("keeps two databases on the same server as two entries", async () => {
		await recordConnection("postgres://u:p@db.example.com/app");
		await recordConnection("postgres://u:p@db.example.com/analytics");
		expect((await listSavedConnections()).map((c) => c.name).sort()).toEqual([
			"db.example.com/analytics",
			"db.example.com/app",
		]);
	});

	it("keeps both of two connections recorded at the same moment", async () => {
		await Promise.all([
			recordConnection("postgres://u:p@a.example.com/one"),
			recordConnection("mysql://u:p@b.example.com/two"),
		]);
		expect(await listSavedConnections()).toHaveLength(2);
	});

	it("writes the file readable by the owner only, inside an owner-only directory", async () => {
		await recordConnection("postgres://u:p@h/db");
		const configDir = process.env.DB_STUDIO_CONFIG_DIR as string;
		expect((await stat(join(configDir, "connections.json"))).mode & 0o777).toBe(0o600);
		expect((await stat(configDir)).mode & 0o777).toBe(0o700);
		expect(JSON.parse(await readFile(join(configDir, "connections.json"), "utf8"))).toMatchObject(
			{ version: 1 },
		);
	});

	it("rejects renaming or deleting an id that does not exist", async () => {
		await expect(updateSavedConnection("missing", { name: "x" })).rejects.toMatchObject({
			status: 404,
		});
		await expect(deleteSavedConnection("missing")).rejects.toMatchObject({ status: 404 });
	});

	it("deletes only the given connection", async () => {
		const keep = await recordConnection("postgres://u:p@h/keep");
		const drop = await recordConnection("postgres://u:p@h/drop");
		await deleteSavedConnection(drop.id);
		expect((await listSavedConnections()).map((c) => c.id)).toEqual([keep.id]);
	});
});
