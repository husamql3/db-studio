import { createServer } from "@/app.js";
import { openEngine } from "./engine.js";

/**
 * The real HTTP app connected to a fresh SQLite file holding `users (id, name)` with Ada and
 * Linus, so a route test sees what a request does to an actual database.
 */
export const openSqliteApp = async () => {
	const { exec, rows, close } = await openEngine("sqlite", "app.sqlite");
	await exec(
		"CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
		"INSERT INTO users VALUES (1, 'Linus'), (2, 'Ada')",
	);
	const { app } = createServer();

	const request = (pathname: string, init: { method?: string; body?: unknown } = {}) =>
		app.handle(
			new Request(new URL(`/api${pathname}`, "http://localhost"), {
				method: init.method,
				headers: { "Content-Type": "application/json" },
				body: init.body === undefined ? undefined : JSON.stringify(init.body),
			}),
		);

	// The connector reads integers as bigint.
	const users = async () =>
		(await rows("SELECT id, name FROM users ORDER BY id")).map(({ id, name }) => ({
			id: Number(id),
			name,
		}));

	return { app, request, users, close };
};
