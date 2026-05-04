import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import type { DataTypes } from "@db-studio/shared/types";
import { BaseAdapter, type NormalizedRow, type QueryBundle } from "@/adapters/base.adapter.js";
import { MongoAdapter } from "@/adapters/mongo/mongo.adapter.js";
import { MsSqlAdapter } from "@/adapters/mssql/mssql.adapter.js";
import { MySqlAdapter } from "@/adapters/mysql/mysql.adapter.js";
import { PgAdapter } from "@/adapters/pg/pg.adapter.js";

const wrap = (adapter: object, error: unknown) =>
	(adapter as { wrapError: (e: unknown) => HTTPException }).wrapError(error);

class HarnessAdapter extends BaseAdapter {
	queryRows: unknown[] = [];
	countRows: unknown[] = [{ total: 0 }];
	bundle: QueryBundle = {
		sql: "SELECT * FROM test LIMIT $1",
		values: [3],
		countSql: "SELECT COUNT(*) as total FROM test",
		countValues: [],
	};

	protected async runQuery<T>(_db: string, sql: string): Promise<T> {
		if (sql.includes("COUNT")) return this.countRows as T;
		return this.queryRows as T;
	}

	protected buildTableDataQuery(): QueryBundle {
		return this.bundle;
	}

	protected normalizeRows(rawRows: unknown[]): NormalizedRow[] {
		return (rawRows as Record<string, unknown>[]).map((row) => this.normalizeRow(row));
	}

	protected buildCursors(
		params: { cursor?: string; direction?: string },
		rows: NormalizedRow[],
		hasMore: boolean,
	): { nextCursor: string | null; prevCursor: string | null } {
		if (rows.length === 0) return { nextCursor: null, prevCursor: null };
		const encode = (row: NormalizedRow) =>
			this.encodeCursor({ values: { id: row.id }, sortColumns: ["id"] });
		if (params.direction === "desc") {
			return {
				nextCursor: params.cursor ? encode(rows[rows.length - 1]) : null,
				prevCursor: hasMore ? encode(rows[0]) : null,
			};
		}
		return {
			nextCursor: hasMore ? encode(rows[rows.length - 1]) : null,
			prevCursor: params.cursor ? encode(rows[0]) : null,
		};
	}

	protected quoteIdentifier(name: string): string {
		return `"${name}"`;
	}

	mapToUniversalType(): DataTypes {
		return "text";
	}

	mapFromUniversalType(): string {
		return "TEXT";
	}
}

describe("BaseAdapter.wrapError()", () => {
	it("maps PostgreSQL connection-class errors to 503", () => {
		const error = Object.assign(new Error("Connection terminated"), { code: "08006" });
		expect(wrap(new PgAdapter(), error).status).toBe(503);
	});

	it("maps MySQL connection errno values to 503", () => {
		const error = Object.assign(new Error("connect failed"), { errno: 2003 });
		expect(wrap(new MySqlAdapter(), error).status).toBe(503);
	});

	it("maps MSSQL login failures to 503", () => {
		const error = new Error("Login failed for user");
		expect(wrap(new MsSqlAdapter(), error).status).toBe(503);
	});

	it("maps MongoDB network errors to 503", () => {
		const error = Object.assign(new Error("server selection failed"), {
			name: "MongoServerSelectionError",
		});
		expect(wrap(new MongoAdapter(), error).status).toBe(503);
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

describe("BaseAdapter template methods", () => {
	it("paginates, trims limit + 1 rows, reverses desc pages, and builds cursors", async () => {
		const adapter = new HarnessAdapter();
		adapter.countRows = [{ total: 3 }];
		adapter.queryRows = [{ id: 3 }, { id: 2 }, { id: 1 }];

		const result = await adapter.getTableData({
			db: "appdb",
			tableName: "users",
			limit: 2,
			direction: "desc",
			cursor: "offset",
		});

		expect(result.data).toEqual([{ id: 2 }, { id: 3 }]);
		expect(result.meta).toMatchObject({
			limit: 2,
			total: 3,
			hasNextPage: true,
			hasPreviousPage: true,
		});
		expect(result.meta.nextCursor).toEqual(expect.any(String));
		expect(result.meta.prevCursor).toEqual(expect.any(String));
	});

	it("returns empty pages without cursors", async () => {
		const adapter = new HarnessAdapter();

		await expect(
			adapter.getTableData({ db: "appdb", tableName: "users", limit: 5 }),
		).resolves.toMatchObject({
			data: [],
			meta: {
				total: 0,
				hasNextPage: false,
				hasPreviousPage: false,
				nextCursor: null,
				prevCursor: null,
			},
		});
	});

	it("exports rows through the shared SELECT * template", async () => {
		const adapter = new HarnessAdapter();
		adapter.queryRows = [{ id: 1, name: "Ada" }];

		await expect(adapter.exportTableData({ db: "appdb", tableName: "users" })).resolves.toEqual({
			cols: ["id", "name"],
			rows: [{ id: 1, name: "Ada" }],
		});
	});

	it("throws 404 when the shared export template returns no rows", async () => {
		const adapter = new HarnessAdapter();

		await expect(adapter.exportTableData({ db: "appdb", tableName: "users" })).rejects.toMatchObject(
			{ status: 404 },
		);
	});

	it("returns 501 for default IDbAdapter stubs", async () => {
		const adapter = new HarnessAdapter();

		for (const call of [
			() => adapter.getDatabasesList(),
			() => adapter.getCurrentDatabase(),
			() => adapter.getDatabaseConnectionInfo(),
			() => adapter.getTablesList("appdb"),
			() => adapter.createTable({ db: "appdb", tableData: { tableName: "x", fields: [] } }),
			() => adapter.deleteTable({ db: "appdb", tableName: "x" }),
			() => adapter.getTableSchema({ db: "appdb", tableName: "x" }),
			() => adapter.getTableColumns({ db: "appdb", tableName: "x" }),
			() => adapter.addColumn({ db: "appdb", tableName: "x", columnName: "c", columnType: "text" } as never),
			() => adapter.deleteColumn({ db: "appdb", tableName: "x", columnName: "c" }),
			() => adapter.alterColumn({ db: "appdb", tableName: "x", columnName: "c", columnType: "text" } as never),
			() => adapter.renameColumn({ db: "appdb", tableName: "x", columnName: "c", newColumnName: "d" }),
			() => adapter.addRecord({ db: "appdb", params: { tableName: "x", data: {} } as never }),
			() => adapter.updateRecords({ db: "appdb", params: { tableName: "x", primaryKey: "id", updates: [] } as never }),
			() => adapter.deleteRecords({ db: "appdb", tableName: "x", primaryKeys: [] }),
			() => adapter.forceDeleteRecords({ db: "appdb", tableName: "x", primaryKeys: [] }),
			() => adapter.bulkInsertRecords({ db: "appdb", tableName: "x", records: [] }),
			() => adapter.executeQuery({ db: "appdb", query: "SELECT 1" }),
		]) {
			await expect(Promise.resolve().then(call)).rejects.toMatchObject({ status: 501 });
		}
	});
});
