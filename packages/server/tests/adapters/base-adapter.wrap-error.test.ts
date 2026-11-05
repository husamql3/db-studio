import sql from "mssql";
import { beforeAll, describe, expect, it } from "vitest";
import type { BaseAdapter } from "@/adapters/base.adapter.js";
import { MongoAdapter } from "@/adapters/mongo/mongo.adapter.js";
import { MsSqlAdapter } from "@/adapters/mssql/mssql.adapter.js";
import { MySqlAdapter } from "@/adapters/mysql/mysql.adapter.js";
import { PgAdapter } from "@/adapters/pg/pg.adapter.js";
import { SqlAdapter } from "@/adapters/sql.adapter.js";
import { loadDriver } from "@/drivers.js";
import { HTTPException } from "@/http-exception.js";

const wrap = (adapter: BaseAdapter, error: unknown) => adapter.classifyError(error);

class HarnessAdapter extends SqlAdapter<null> {
	queryRows: unknown[] = [];

	protected readonly quoteIdentifier = (name: string) => `"${name}"`;
	protected readonly placeholder = () => "?";

	protected connect<T>(_db: string, work: (conn: null) => Promise<T>) {
		return work(null);
	}

	protected async rows<T>() {
		return this.queryRows as T[];
	}

	protected async referencingKeys() {
		return [];
	}

	getTableData(): never {
		throw new Error("not used");
	}
}

describe("BaseAdapter.classifyError()", () => {
	// A PostgreSQL error only exists once a connection has loaded pg.
	beforeAll(() => loadDriver("pg"));

	it("maps PostgreSQL connection-class errors to 503", () => {
		const error = Object.assign(new Error("Connection terminated"), { code: "08006" });
		expect(wrap(new PgAdapter(), error)).toMatchObject({ status: 503, cause: error });
	});

	it("maps MySQL connection errno values to 503", () => {
		const error = Object.assign(new Error("connect failed"), { errno: 2003 });
		expect(wrap(new MySqlAdapter(), error).status).toBe(503);
	});

	it("maps MSSQL login failures to 503", () => {
		const error = new Error("Login failed for user");
		expect(wrap(new MsSqlAdapter(), error).status).toBe(503);
	});

	it("maps an MSSQL connect timeout to 503, but not a query timeout", () => {
		const connect = new sql.ConnectionError(
			"Failed to connect to db:1433 in 15000ms",
			"ETIMEOUT",
		);

		const query = new sql.RequestError(
			"Timeout: Request failed to complete in 15000ms",
			"ETIMEOUT",
		);

		expect(wrap(new MsSqlAdapter(), connect)).toMatchObject({ status: 503, cause: connect });
		expect(wrap(new MsSqlAdapter(), query).status).toBe(500);
	});

	it("maps MongoDB network errors to 503", () => {
		const error = Object.assign(new Error("server selection failed"), {
			name: "MongoServerSelectionError",
		});

		expect(wrap(new MongoAdapter(), error)).toMatchObject({ status: 503, cause: error });
	});

	it("preserves HTTPException instances and maps generic errors to 500", () => {
		const httpError = new HTTPException(409, { message: "conflict" });
		expect(wrap(new PgAdapter(), httpError)).toBe(httpError);
		expect(wrap(new PgAdapter(), new Error("boom")).status).toBe(500);
	});

	it("maps non-error thrown values to 500", () => {
		expect(wrap(new PgAdapter(), "boom").status).toBe(500);
	});
});

describe("SqlAdapter.exportTableData()", () => {
	it("exports rows through the shared SELECT * template", async () => {
		const adapter = new HarnessAdapter();
		adapter.queryRows = [{ id: 1, name: "Ada" }];

		await expect(
			adapter.exportTableData({ db: "appdb", tableName: "users" }),
		).resolves.toEqual({
			cols: ["id", "name"],
			rows: [{ id: 1, name: "Ada" }],
		});
	});

	it("throws 404 when the shared export template returns no rows", async () => {
		const adapter = new HarnessAdapter();

		await expect(
			adapter.exportTableData({ db: "appdb", tableName: "users" }),
		).rejects.toMatchObject({ status: 404 });
	});
});
