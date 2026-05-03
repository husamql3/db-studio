import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDbPool = vi.hoisted(() => vi.fn());

vi.mock("@/adapters/connections.js", () => ({
	getDbPool: mockGetDbPool,
}));

import { PgAdapter } from "@/adapters/pg/pg.adapter.js";

const result = (rows: unknown[] = [], rowCount = rows.length, fields = [{ name: "id" }]) => ({
	rows,
	rowCount,
	fields,
});

const tableDataRows = [
	{ id: 1, name: "Ada", ctid: "(0,1)" },
	{ id: 2, name: "Linus", ctid: "(0,2)" },
];

function createPgPool() {
	const client = {
		query: vi.fn(async (sql: string) => {
			if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return result();
			return result([{ id: 1 }], 1);
		}),
		release: vi.fn(),
	};

	const pool = {
		connect: vi.fn(async () => client),
		query: vi.fn(async (sqlInput: string, values?: unknown[]) => {
			const sql = String(sqlInput);

			if (sql.includes("pg_catalog.pg_database")) {
				return result([{ name: "appdb", size: "1 MB", owner: "postgres", encoding: "UTF8" }]);
			}
			if (sql.includes("version() as version")) {
				return result([
					{
						version: "PostgreSQL 16",
						database: "appdb",
						user: "postgres",
						host: "localhost",
						port: 5432,
						active_connections: 1,
						max_connections: 100,
					},
				]);
			}
			if (sql.includes("current_database() as database")) return result([{ db: "appdb" }]);
			if (sql.includes("table_schema as") && sql.includes("information_schema.tables")) {
				return result([{ schemaName: "public", tableName: "users" }]);
			}
			if (sql.includes("COUNT(*)::integer")) return result([{ count: 2 }]);
			if (sql.includes("pg_index")) return result([{ column_name: "id" }]);
			if (sql.includes("SELECT COUNT(*) as total")) return result([{ total: 2 }]);
			if (sql.includes("COUNT(*)") && sql.includes('FROM "users"')) {
				return result([{ count: 2 }]);
			}
			if (sql.includes('SELECT * FROM "users"')) return result(tableDataRows);
			if (sql.includes("SELECT EXISTS") && sql.includes("information_schema.tables")) {
				return result([{ exists: true }]);
			}
			if (sql.includes("SELECT EXISTS") && sql.includes("information_schema.columns")) {
				return result([{ exists: values?.[1] !== "age" && values?.[1] !== "fullName" }]);
			}
			if (sql.includes('c.column_name as "columnName"')) {
				return result([
					{
						columnName: "id",
						dataType: "integer",
						udtName: "int4",
						isNullable: false,
						columnDefault: null,
						isPrimaryKey: true,
						isForeignKey: false,
						referencedTable: null,
						referencedColumn: null,
						enumValues: null,
					},
					{
						columnName: "status",
						dataType: "USER-DEFINED",
						udtName: "status_enum",
						isNullable: true,
						columnDefault: null,
						isPrimaryKey: false,
						isForeignKey: false,
						referencedTable: null,
						referencedColumn: null,
						enumValues: "{active,inactive}",
					},
				]);
			}
			if (sql.includes("SELECT column_name, data_type")) {
				return result([
					{
						column_name: "id",
						data_type: "integer",
						udt_name: "int4",
						is_nullable: "NO",
						column_default: null,
						character_maximum_length: null,
						numeric_precision: null,
						numeric_scale: null,
					},
					{
						column_name: "price",
						data_type: "numeric",
						udt_name: "numeric",
						is_nullable: "YES",
						column_default: null,
						character_maximum_length: null,
						numeric_precision: 10,
						numeric_scale: 2,
					},
					{
						column_name: "code",
						data_type: "character varying",
						udt_name: "varchar",
						is_nullable: "YES",
						column_default: null,
						character_maximum_length: 32,
						numeric_precision: null,
						numeric_scale: null,
					},
				]);
			}
			if (sql.includes("ccu.table_name = $1")) return result([]);
			if (sql.includes("tc.constraint_name")) {
				return result([
					{
						constraint_name: "users_pkey",
						constraint_type: "PRIMARY KEY",
						column_name: "id",
						foreign_table_name: null,
						foreign_column_name: null,
					},
					{
						constraint_name: "users_group_fk",
						constraint_type: "FOREIGN KEY",
						column_name: "group_id",
						foreign_table_name: "groups",
						foreign_column_name: "id",
					},
					{
						constraint_name: "users_email_key",
						constraint_type: "UNIQUE",
						column_name: "email",
						foreign_table_name: null,
						foreign_column_name: null,
					},
				]);
			}
			if (sql.includes("pg_indexes")) {
				return result([
					{ indexname: "users_name_idx", indexdef: "CREATE INDEX users_name_idx ON users (name)" },
				]);
			}
			if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return result();
			if (sql.startsWith("INSERT INTO")) return result([{ id: 1 }], 1);
			if (sql.startsWith("UPDATE")) return result([{ id: 1 }], 1);
			if (sql.startsWith("DELETE")) return result([{ id: 1 }], 1);
			if (sql.startsWith("DROP TABLE") || sql.startsWith("CREATE TABLE")) return result();
			if (sql.startsWith("ALTER TABLE")) return result([], 1);
			if (sql === "SELECT 1") return result([{ id: 1 }], 1, [{ name: "id" }]);

			return result([]);
		}),
	};

	return { pool, client };
}

describe("PgAdapter integration scaffold", () => {
	let adapter: PgAdapter;
	let pool: ReturnType<typeof createPgPool>["pool"];

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new PgAdapter();
		pool = createPgPool().pool;
		mockGetDbPool.mockReturnValue(pool);
	});

	it("executes every IDbAdapter method on the PostgreSQL pool happy path", async () => {
		expect(await adapter.getDatabasesList()).toHaveLength(1);
		expect(await adapter.getCurrentDatabase()).toEqual({ db: "appdb" });
		expect((await adapter.getDatabaseConnectionInfo()).database).toBe("appdb");
		expect(await adapter.getTablesList("appdb")).toEqual([
			{ schemaName: "public", tableName: "users", rowCount: 2 },
		]);

		await adapter.createTable({
			db: "appdb",
			tableData: {
				tableName: "users",
				fields: [
					{ columnName: "id", columnType: "integer", isPrimaryKey: true },
					{
						columnName: "email",
						columnType: "text",
						isUnique: true,
						isNullable: false,
						defaultValue: "'n/a'",
					},
					{ columnName: "tags", columnType: "text", isArray: true, isNullable: true },
					{ columnName: "serial_no", columnType: "integer", isIdentity: true },
				],
				foreignKeys: [
					{
						columnName: "group_id",
						referencedTable: "groups",
						referencedColumn: "id",
						onUpdate: "CASCADE",
						onDelete: "SET NULL",
					},
				],
			} as never,
		});
		expect(await adapter.deleteTable({ db: "appdb", tableName: "users", cascade: true })).toEqual(
			{ deletedCount: 2, fkViolation: false, relatedRecords: [] },
		);
		expect(await adapter.getTableSchema({ db: "appdb", tableName: "users" })).toContain(
			"create table public.users",
		);
		expect(await adapter.getTableColumns({ db: "appdb", tableName: "users" })).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ columnName: "id" }),
				expect.objectContaining({ columnName: "status", enumValues: ["active", "inactive"] }),
			]),
		);

		await adapter.addColumn({
			db: "appdb",
			tableName: "users",
			columnName: "age",
			columnType: "integer",
			defaultValue: "18",
			isUnique: true,
			isNullable: true,
			isArray: true,
		} as never);
		expect(
			await adapter.deleteColumn({
				db: "appdb",
				tableName: "users",
				columnName: "name",
				cascade: true,
			}),
		).toEqual({ deletedCount: 1 });
		await adapter.alterColumn({
			db: "appdb",
			tableName: "users",
			columnName: "name",
			columnType: "text",
			isNullable: true,
		} as never);
		await adapter.renameColumn({
			db: "appdb",
			tableName: "users",
			columnName: "name",
			newColumnName: "fullName",
		});

		expect(
			await adapter.getTableData({ db: "appdb", tableName: "users", limit: 2, sort: "id" }),
		).toMatchObject({ meta: { total: 2 }, data: tableDataRows });
		expect(
			await adapter.exportTableData({ db: "appdb", tableName: "users" }),
		).toMatchObject({ cols: ["id", "name", "ctid"], rows: tableDataRows });
		expect(
			await adapter.addRecord({
				db: "appdb",
				params: { tableName: "users", data: { name: "Ada" } },
			} as never),
		).toEqual({ insertedCount: 1 });
		expect(
			await adapter.updateRecords({
				db: "appdb",
				params: {
					tableName: "users",
					primaryKey: "id",
					updates: [{ columnName: "name", value: "Grace", rowData: { id: 1 } }],
				},
			} as never),
		).toEqual({ updatedCount: 1 });
		expect(
			await adapter.deleteRecords({
				db: "appdb",
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			}),
		).toEqual({ deletedCount: 1, fkViolation: false, relatedRecords: [] });
		expect(
			await adapter.forceDeleteRecords({
				db: "appdb",
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			}),
		).toEqual({ deletedCount: 1 });
		expect(
			await adapter.bulkInsertRecords({
				db: "appdb",
				tableName: "users",
				records: [{ name: "Ada" }],
			}),
		).toMatchObject({ success: true, successCount: 1, failureCount: 0 });
		expect(await adapter.executeQuery({ db: "appdb", query: "SELECT 1;" })).toMatchObject({
			columns: ["id"],
			rowCount: 1,
		});
		expect(adapter.mapToUniversalType("integer")).toBe("number");
		expect(adapter.mapFromUniversalType("json")).toBe("JSONB");
		expect(pool.query).toHaveBeenCalled();
	});

	it("covers PostgreSQL cursor pagination and protected query helpers", async () => {
		const cursor = (
			adapter as unknown as {
				encodeCursor: (data: { values: Record<string, unknown>; sortColumns: string[] }) => string;
			}
		).encodeCursor({ values: { id: 1 }, sortColumns: ["id"] });

		const helper = adapter as unknown as {
			buildTableDataQuery: (params: Record<string, unknown>) => {
				sql: string;
				values: unknown[];
			};
			buildCursors: (
				params: Record<string, unknown>,
				rows: Record<string, unknown>[],
				hasMore: boolean,
			) => { nextCursor: string | null; prevCursor: string | null };
			quoteIdentifier: (name: string) => string;
			decodeCursor: (cursor: string) => unknown;
		};

		expect(
			helper.buildTableDataQuery({
				db: "appdb",
				tableName: "users",
				limit: 1,
				cursor,
				direction: "desc",
				sort: [],
				filters: [{ columnName: "name", operator: "like", value: "%a%" }],
			}).sql,
		).toContain('ORDER BY "ctid" DESC');
		expect(
			helper.buildTableDataQuery({
				db: "appdb",
				tableName: "users",
				sort: [{ columnName: "name", direction: "desc" }],
				order: "asc",
				direction: "desc",
				filters: [{ columnName: "active", operator: "=", value: "true" }],
				cursor,
			}).values,
		).toEqual(["true", 1, 51]);
		expect(helper.buildCursors({ sort: "id", direction: "asc" }, [], false)).toEqual({
			nextCursor: null,
			prevCursor: null,
		});
		expect(
			helper.buildCursors({ sort: "id", direction: "desc", cursor }, [{ id: 1 }, { id: 2 }], true),
		).toEqual({ nextCursor: expect.any(String), prevCursor: expect.any(String) });
		expect(helper.quoteIdentifier("users")).toBe('"users"');
		expect(helper.decodeCursor("not-a-cursor")).toBeNull();

		expect(
			await adapter.getTableData({
				db: "appdb",
				tableName: "users",
				limit: 1,
				direction: "desc",
				cursor,
				sort: [{ columnName: "id", direction: "desc" }],
				filters: [{ columnName: "name", operator: "ilike", value: "%a%" }],
			}),
		).toMatchObject({
			meta: {
				limit: 1,
				total: 2,
				hasNextPage: true,
				hasPreviousPage: true,
			},
		});

		expect(adapter.mapFromUniversalType("text")).toBe("TEXT");
		expect(adapter.mapFromUniversalType("number")).toBe("INTEGER");
		expect(adapter.mapFromUniversalType("boolean")).toBe("BOOLEAN");
		expect(adapter.mapFromUniversalType("date")).toBe("TIMESTAMP WITH TIME ZONE");
		expect(adapter.mapFromUniversalType("array")).toBe("TEXT[]");
		expect(adapter.mapFromUniversalType("enum")).toBe("TEXT");
		expect(adapter.mapFromUniversalType("unknown")).toBe("TEXT");
		expect(adapter.mapToUniversalType("boolean")).toBe("boolean");
		expect(adapter.mapToUniversalType("jsonb")).toBe("json");
		expect(adapter.mapToUniversalType("timestamp")).toBe("date");
	});

	it("covers PostgreSQL validation and error branches", async () => {
		pool.query.mockResolvedValueOnce(result([]));
		await expect(adapter.getDatabasesList()).rejects.toMatchObject({ status: 500 });

		pool.query.mockResolvedValueOnce(result([]));
		await expect(adapter.getCurrentDatabase()).rejects.toMatchObject({ status: 500 });

		pool.query.mockResolvedValueOnce(result([]));
		await expect(adapter.getDatabaseConnectionInfo()).rejects.toMatchObject({ status: 500 });

		pool.query.mockResolvedValueOnce(result([]));
		await expect(adapter.getTablesList("appdb")).resolves.toEqual([]);

		pool.query.mockResolvedValueOnce(result([{ exists: false }]));
		await expect(adapter.deleteTable({ db: "appdb", tableName: "missing" })).rejects.toMatchObject({
			status: 404,
		});

		pool.query.mockResolvedValueOnce(result([{ exists: false }]));
		await expect(
			adapter.getTableSchema({ db: "appdb", tableName: "missing" }),
		).rejects.toMatchObject({ status: 404 });

		pool.query.mockResolvedValueOnce(result([]));
		await expect(
			adapter.getTableColumns({ db: "appdb", tableName: "missing" }),
		).rejects.toMatchObject({ status: 404 });

		pool.query.mockResolvedValueOnce(result([{ exists: false }]));
		await expect(
			adapter.addColumn({
				db: "appdb",
				tableName: "missing",
				columnName: "age",
				columnType: "integer",
			} as never),
		).rejects.toMatchObject({ status: 404 });

		pool.query
			.mockResolvedValueOnce(result([{ exists: true }]))
			.mockResolvedValueOnce(result([{ exists: true }]));
		await expect(
			adapter.addColumn({
				db: "appdb",
				tableName: "users",
				columnName: "age",
				columnType: "integer",
			} as never),
		).rejects.toMatchObject({ status: 409 });

		pool.query
			.mockResolvedValueOnce(result([{ exists: true }]))
			.mockResolvedValueOnce(result([{ exists: false }]));
		await expect(
			adapter.deleteColumn({ db: "appdb", tableName: "users", columnName: "missing" }),
		).rejects.toMatchObject({ status: 404 });

		pool.query
			.mockResolvedValueOnce(result([{ exists: true }]))
			.mockResolvedValueOnce(result([{ exists: true }]))
			.mockResolvedValueOnce(result([{ exists: true }]));
		await expect(
			adapter.renameColumn({
				db: "appdb",
				tableName: "users",
				columnName: "name",
				newColumnName: "id",
			}),
		).rejects.toMatchObject({ status: 409 });

		await expect(
			adapter.updateRecords({
				db: "appdb",
				params: {
					tableName: "users",
					primaryKey: "id",
					updates: [{ columnName: "name", value: "Ada", rowData: {} }],
				},
			} as never),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			adapter.deleteRecords({ db: "appdb", tableName: "users", primaryKeys: [] }),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			adapter.forceDeleteRecords({ db: "appdb", tableName: "users", primaryKeys: [] }),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			adapter.bulkInsertRecords({ db: "appdb", tableName: "users", records: [] }),
		).rejects.toMatchObject({ status: 400 });
		await expect(adapter.executeQuery({ db: "appdb", query: "" })).rejects.toMatchObject({
			status: 400,
		});

		const helper = adapter as unknown as {
			getFkConstraints: (pgPool: typeof pool, tableName: string) => Promise<unknown[]>;
			getRelatedRecordsForTable: (pgPool: typeof pool, tableName: string) => Promise<unknown[]>;
			getRelatedRecords: (
				pgPool: typeof pool,
				tableName: string,
				primaryKeys: Array<{ columnName: string; value: unknown }>,
				db: string,
			) => Promise<unknown[]>;
		};
		const fkRows = [
			{
				constraint_name: "orders_user_id_fkey",
				referencing_table: "orders",
				referencing_column: "user_id",
				referenced_table: "users",
				referenced_column: "id",
			},
		];
		pool.query.mockResolvedValueOnce(result(fkRows));
		await expect(helper.getFkConstraints(pool, "users")).resolves.toEqual([
			{
				constraintName: "orders_user_id_fkey",
				referencingTable: "orders",
				referencingColumn: "user_id",
				referencedTable: "users",
				referencedColumn: "id",
			},
		]);

		pool.query.mockResolvedValueOnce(result(fkRows)).mockResolvedValueOnce(result([{ id: 10 }]));
		await expect(helper.getRelatedRecordsForTable(pool, "users")).resolves.toEqual([
			{
				tableName: "orders",
				columnName: "user_id",
				constraintName: "orders_user_id_fkey",
				records: [{ id: 10 }],
			},
		]);

		pool.query.mockResolvedValueOnce(result(fkRows)).mockResolvedValueOnce(result([{ id: 10 }]));
		await expect(
			helper.getRelatedRecords(pool, "users", [{ columnName: "id", value: 1 }], "appdb"),
		).resolves.toEqual([
			{
				tableName: "orders",
				columnName: "user_id",
				constraintName: "orders_user_id_fkey",
				records: [{ id: 10 }],
			},
		]);
	});
});
