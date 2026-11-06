import { beforeAll, describe, expect, it } from "vitest";
import { MongoAdapter } from "@/adapters/mongo/mongo.adapter.js";
import { MsSqlAdapter } from "@/adapters/mssql/mssql.adapter.js";
import { MySqlAdapter } from "@/adapters/mysql/mysql.adapter.js";
import { PgAdapter } from "@/adapters/pg/pg.adapter.js";
import { loadDriver } from "@/drivers.js";
import { HTTPException } from "@/http-exception.js";

describe("BaseAdapter.classifyError()", () => {
	// PgAdapter checks for a PostgreSQL error, which only exists once a connection loaded pg.
	beforeAll(() => loadDriver("pg"));

	it("maps MySQL connection errno values to 503", () => {
		const error = Object.assign(new Error("connect failed"), { errno: 2003 });
		expect(new MySqlAdapter().classifyError(error).status).toBe(503);
	});

	it("maps MSSQL login failures to 503", () => {
		const error = new Error("Login failed for user");
		expect(new MsSqlAdapter().classifyError(error).status).toBe(503);
	});

	it("maps MongoDB network errors to 503", () => {
		const error = Object.assign(new Error("server selection failed"), {
			name: "MongoServerSelectionError",
		});

		expect(new MongoAdapter().classifyError(error)).toMatchObject({
			status: 503,
			cause: error,
		});
	});

	it("preserves HTTPException instances and maps generic errors to 500", () => {
		const httpError = new HTTPException(409, { message: "conflict" });
		expect(new PgAdapter().classifyError(httpError)).toBe(httpError);
		expect(new PgAdapter().classifyError(new Error("boom")).status).toBe(500);
	});

	it("maps non-error thrown values to 500", () => {
		expect(new PgAdapter().classifyError("boom").status).toBe(500);
	});
});
