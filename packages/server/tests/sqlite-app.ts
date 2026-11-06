import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { createServer } from "@/app.js";
import {
	closeAllConnections,
	createConnection,
	registerConnection,
} from "@/open-connections.js";

/**
 * The real HTTP app connected to a fresh SQLite file holding `users (id, name)` with Ada and
 * Linus, so a route test sees what a request does to an actual database.
 */
export const openSqliteApp = async () => {
	const dir = mkdtempSync(path.join(tmpdir(), "db-studio-routes-"));
	const file = path.join(dir, "app.sqlite");
	const client = createClient({ url: `file:${file}` });
	await client.batch(
		[
			"CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
			"INSERT INTO users VALUES (1, 'Linus'), (2, 'Ada')",
		],
		"write",
	);
	registerConnection("routes-test", createConnection(`sqlite://${file}`));
	const { app } = createServer();

	const request = (pathname: string, init: { method?: string; body?: unknown } = {}) =>
		app.handle(
			new Request(new URL(`/api${pathname}`, "http://localhost"), {
				method: init.method,
				headers: { "Content-Type": "application/json" },
				body: init.body === undefined ? undefined : JSON.stringify(init.body),
			}),
		);

	const users = async () =>
		(await client.execute("SELECT id, name FROM users ORDER BY id")).rows.map((row) => ({
			...row,
		}));

	const close = async () => {
		client.close();
		await closeAllConnections();
		rmSync(dir, { recursive: true, force: true });
	};

	return { app, request, users, close };
};
