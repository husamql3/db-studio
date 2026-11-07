/**
 * A request that names no connection (curl, scripts, a tab from before per-tab connections) is
 * served by the connection that was the latest when it arrived.
 * Failure modes:
 * - a connection another tab opens while the request runs takes over its later database calls,
 *   so the request reads from, or writes to, the other database
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { afterAll, expect, it, vi } from "vitest";

vi.unmock("@/db-manager.js");

const dir = mkdtempSync(path.join(tmpdir(), "db-studio-connections-"));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const sqliteFile = async (name: string, table: string) => {
	const file = path.join(dir, name);
	const client = createClient({ url: `file:${file}` });
	await client.execute(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`);
	client.close();
	return file;
};

it("keeps a request without X-Connection-Id on the connection that was latest when it arrived", async () => {
	vi.resetModules();
	const { createServer } = await import("@/utils/create-server.js");
	const { DatabaseManager, openConnection } = await import("@/db-manager.js");
	const { getAdapter } = await import("@/adapters/adapter.registry.js");
	const a = await sqliteFile("a.sqlite", "only_in_a");
	const b = await sqliteFile("b.sqlite", "only_in_b");

	openConnection("a", new DatabaseManager(`sqlite://${a}`));
	const { app } = createServer();
	const adapter = getAdapter("sqlite");
	const getTablesList = adapter.getTablesList.bind(adapter);
	const entered = Promise.withResolvers<void>();
	const resume = Promise.withResolvers<void>();
	// Pause the request after it started, before it reaches the database.
	vi.spyOn(adapter, "getTablesList").mockImplementation(async (db) => {
		entered.resolve();
		await resume.promise;
		return getTablesList(db);
	});

	const response = app.handle(new Request("http://localhost/api/sqlite/tables?db=main"));
	await entered.promise;
	openConnection("b", new DatabaseManager(`sqlite://${b}`));
	resume.resolve();

	const { data } = (await (await response).json()) as { data: { tableName: string }[] };
	expect(data.map((table) => table.tableName)).toEqual(["only_in_a"]);
});
