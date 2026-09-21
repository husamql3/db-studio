import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDbPool = vi.hoisted(() => vi.fn());

vi.mock("@/adapters/connections.js", () => ({
	getDbPool: mockGetDbPool,
}));

import { PgAdapter } from "@/adapters/pg/pg.adapter.js";

/**
 * getTablesList spans every user schema, so metadata lookups must resolve a
 * bare table name the same way Postgres does. Hardcoding 'public' made a table
 * in another schema list in the sidebar but 404 on its columns.
 */
describe("PgAdapter schema resolution", () => {
	let statements: string[];
	let adapter: PgAdapter;

	beforeEach(() => {
		statements = [];
		mockGetDbPool.mockReturnValue({
			query: vi.fn(async (sql: string) => {
				statements.push(String(sql));
				// Let existence checks pass so the queries after them still run.
				const rows = String(sql).includes("as exists") ? [{ exists: true }] : [];
				return { rows, rowCount: rows.length, fields: [] };
			}),
		});
		adapter = new PgAdapter();
	});

	const catalogSql = () => statements.filter((s) => s.includes("information_schema"));

	it("never pins a metadata lookup to the public schema", async () => {
		await adapter.getTableColumns({ db: "appdb", tableName: "daily_summarie" }).catch(() => {});
		await adapter.getTableSchema({ db: "appdb", tableName: "daily_summarie" }).catch(() => {});

		expect(statements.length).toBeGreaterThan(0);
		for (const sql of statements) {
			expect(sql).not.toContain("table_schema = 'public'");
			expect(sql).not.toContain("schemaname = 'public'");
		}
	});

	it("resolves columns through the search path in precedence order", async () => {
		await adapter.getTableColumns({ db: "appdb", tableName: "daily_summarie" }).catch(() => {});

		const columnsQuery = catalogSql().find((s) => s.includes("information_schema.columns"));
		expect(columnsQuery).toBeDefined();
		// One schema only — a name in two schemas must not duplicate its columns.
		expect(columnsQuery).toContain("unnest(current_schemas(false))");
		expect(columnsQuery).toContain("ORDER BY sp.position LIMIT 1");
	});

	it("accepts a table living in any schema on the search path", async () => {
		await adapter.getTableSchema({ db: "appdb", tableName: "daily_summarie" }).catch(() => {});

		const existsQuery = catalogSql().find((s) => s.includes("as exists"));
		expect(existsQuery).toContain("ANY(current_schemas(false))");
	});

	it("scopes a column check to the table the DDL will actually alter", async () => {
		// With two "projects" tables, search_path picks one. Asking whether the
		// column exists in *any* schema wrongly rejects adding a column that only
		// the other schema's table has.
		await adapter
			.addColumn({
				db: "appdb",
				tableName: "projects",
				columnName: "other_col",
				columnType: "text",
				isNullable: true,
			} as never)
			.catch(() => {});

		const colCheck = statements.find((s) => s.includes("column_name = $2"));
		expect(colCheck).toBeDefined();
		expect(colCheck).not.toContain("ANY(current_schemas(false))");
		expect(colCheck).toContain("unnest(current_schemas(false))");
	});

	it("still reports a genuinely missing table as 404", async () => {
		mockGetDbPool.mockReturnValue({
			query: vi.fn(async () => ({ rows: [{ exists: false }], rowCount: 1, fields: [] })),
		});

		await expect(
			adapter.getTableSchema({ db: "appdb", tableName: "nope" }),
		).rejects.toMatchObject({ status: 404 });
	});
});
