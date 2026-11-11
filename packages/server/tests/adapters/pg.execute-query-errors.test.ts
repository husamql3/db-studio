/**
 * DB-STUDIO-SERVER-13: a query the user typed into the query runner that names a missing table
 * answered 500 and reached Sentry as a server failure. Ways this can go wrong:
 * - a mistake in the user's SQL (class 42: syntax, missing table or column) answers 500
 * - the fix swallows a permission refusal (42501), which must still answer 403
 * - the fix turns a failure that is not the user's SQL (e.g. a cancelled statement) into a 400
 */
import { DatabaseError } from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ADAPTERS } from "@/adapters/adapter.registry.js";
import { createServer } from "@/app.js";
import { loadDriver } from "@/drivers.js";

const pgError = (code: string, message: string) => {
	const error = new DatabaseError(message, 0, "error");
	error.code = code;
	return error;
};

// The real PgAdapter query runner and error handler; only the database connection is stubbed.
const runQuery = async (error: DatabaseError) => {
	const conn = { query: vi.fn().mockRejectedValue(error) };
	const pg = ADAPTERS.pg as unknown as { connect: (db: string, work: unknown) => unknown };
	vi.spyOn(pg, "connect").mockImplementation((_db, work) =>
		(work as (c: typeof conn) => unknown)(conn),
	);

	const app = createServer().app;
	app.get("/api/pg/run", () =>
		ADAPTERS.pg.executeQuery({ query: "SELECT * FROM missing", db: "appdb" }),
	);
	const res = await app.handle(new Request("http://localhost/api/pg/run"));

	return { status: res.status, body: await res.json() };
};

describe("PostgreSQL query runner with a failing statement", () => {
	beforeAll(() => loadDriver("pg"));

	it.each([
		["42P01", 'relation "missing" does not exist'],
		["42601", 'syntax error at or near "SELEC"'],
		["42703", 'column "nme" does not exist'],
	])("answers 400 with the database message for user SQL error %s", async (code, message) => {
		const { status, body } = await runQuery(pgError(code, message));

		expect(status).toBe(400);
		expect(body.error).toBe(message);
	});

	it("still answers 403 for a permission refusal", async () => {
		const { status } = await runQuery(pgError("42501", "permission denied for table missing"));

		expect(status).toBe(403);
	});

	it("still answers 500 for a failure outside the user's SQL", async () => {
		const { status } = await runQuery(
			pgError("57014", "canceling statement due to statement timeout"),
		);

		expect(status).toBe(500);
	});
});
