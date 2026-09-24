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
			// The columns check is tested first: its schema resolver subquery also
			// mentions information_schema.tables, so the table branch would swallow it.
			if (sql.includes("SELECT EXISTS") && sql.includes("information_schema.columns")) {
				return result([{ exists: values?.[1] !== "age" && values?.[1] !== "fullName" }]);
			}
			if (sql.includes("SELECT EXISTS") && sql.includes("information_schema.tables")) {
				return result([{ exists: true }]);
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

	it("builds the paginated data query and maps column types", async () => {
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

	describe("getDatabasesList system filtering", () => {
		it("sends a query that excludes postgres but keeps the current database", async () => {
			await adapter.getDatabasesList();
			const dbQuery = pool.query.mock.calls
				.map((call) => String(call[0]))
				.find((sql) => sql.includes("pg_catalog.pg_database"));
			expect(dbQuery).toContain("NOT IN ('postgres', 'rdsadmin')");
			expect(dbQuery).toContain("current_database()");
		});
	});
});

describe("PgAdapter.renameTable", () => {
	let adapter: PgAdapter;
	let statements: string[];

	// Simulated information_schema: which schemas contain each table name.
	const schemasByTable: Record<string, string[]> = {
		users: ["public"],
		accounts: ["public", "audit"],
		product: ["analytics"],
		item: ["analytics"],
		legacy: ["archive", "backup"],
		'we"ird': ["public"],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new PgAdapter();
		statements = [];
		const pool = {
			query: vi.fn(async (sql: string, values?: unknown[]) => {
				const text = String(sql);
				statements.push(text);
				if (text.includes('table_schema as "schemaName"')) {
					const name = values?.[0] as string;
					return result((schemasByTable[name] ?? []).map((s) => ({ schemaName: s })));
				}
				if (text.includes("SELECT EXISTS") && text.includes("information_schema.tables")) {
					const [target, schema] = values as [string, string];
					return result([{ exists: (schemasByTable[target] ?? []).includes(schema) }]);
				}
				return result([]);
			}),
		};
		mockGetDbPool.mockReturnValue(pool);
	});

	it("renames a public table", async () => {
		await adapter.renameTable({ db: "appdb", tableName: "users", newTableName: "members" });
		expect(statements.at(-1)).toBe('ALTER TABLE "public"."users" RENAME TO "members"');
	});

	it("renames a table living in a non-public schema", async () => {
		await adapter.renameTable({ db: "appdb", tableName: "product", newTableName: "goods" });
		expect(statements.at(-1)).toBe('ALTER TABLE "analytics"."product" RENAME TO "goods"');
	});

	it("renames the explicitly selected schema when table names overlap", async () => {
		await adapter.renameTable({
			db: "appdb",
			tableName: "accounts",
			newTableName: "archived_accounts",
			schemaName: "audit",
		});
		expect(statements.at(-1)).toBe(
			'ALTER TABLE "audit"."accounts" RENAME TO "archived_accounts"',
		);
	});

	it("rejects a rename aimed at a schema the table is not in", async () => {
		await expect(
			adapter.renameTable({
				db: "appdb",
				tableName: "accounts",
				newTableName: "archived_accounts",
				schemaName: "reporting",
			}),
		).rejects.toMatchObject({ status: 404 });
	});

	it("escapes double quotes in identifiers", async () => {
		await adapter.renameTable({ db: "appdb", tableName: 'we"ird', newTableName: "ok" });
		expect(statements.at(-1)).toBe('ALTER TABLE "public"."we""ird" RENAME TO "ok"');
	});

	it("returns 404 when the table does not exist in any schema", async () => {
		await expect(
			adapter.renameTable({ db: "appdb", tableName: "ghost", newTableName: "spook" }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("returns 409 when the target name exists in the same schema", async () => {
		await expect(
			adapter.renameTable({ db: "appdb", tableName: "product", newTableName: "item" }),
		).rejects.toMatchObject({ status: 409 });
	});

	it("returns 400 when the table exists in multiple non-public schemas", async () => {
		await expect(
			adapter.renameTable({ db: "appdb", tableName: "legacy", newTableName: "modern" }),
		).rejects.toMatchObject({ status: 400 });
	});
});
