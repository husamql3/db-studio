import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";
import type { ColumnInfoSchemaType } from "@db-studio/shared/types";

import { createServer } from "@/utils/create-server.js";

const mockDao = vi.hoisted(() => ({
	getDatabasesList: vi.fn(),
	getCurrentDatabase: vi.fn(),
	getDatabaseConnectionInfo: vi.fn(),
	getTablesList: vi.fn(),
	createTable: vi.fn(),
	deleteTable: vi.fn(),
	getTableSchema: vi.fn(),
	getTableColumns: vi.fn(),
	addColumn: vi.fn(),
	deleteColumn: vi.fn(),
	alterColumn: vi.fn(),
	renameColumn: vi.fn(),
	getTableData: vi.fn(),
	addRecord: vi.fn(),
	updateRecords: vi.fn(),
	deleteRecords: vi.fn(),
	forceDeleteRecords: vi.fn(),
	bulkInsertRecords: vi.fn(),
	exportTableData: vi.fn(),
	executeQuery: vi.fn(),
}));

vi.mock("@/adapters/adapter.registry.js", () => ({
	getAdapter: vi.fn(() => mockDao),
	adapterRegistry: {
		register: vi.fn(),
		get: vi.fn(() => mockDao),
		has: vi.fn((type: string) => ["pg", "mysql", "mssql", "mongodb"].includes(type)),
		getSupportedTypes: vi.fn(() => ["pg", "mysql", "mssql", "mongodb"]),
	},
}));

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({ query: vi.fn() })),
	getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
	getDbType: vi.fn(() => "mysql"),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
}));

describe("Tables Routes (MySQL)", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		const server = createServer();
		app = server.app;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ============================================
	// GET /mysql/tables - List all tables
	// ============================================
	describe("GET /mysql/tables", () => {
		it("should return list of tables with 200 status", async () => {
			const mockTables = [
				{ tableName: "users", rowCount: 100 },
				{ tableName: "orders", rowCount: 500 },
				{ tableName: "products", rowCount: 250 },
			];

			mockDao.getTablesList.mockResolvedValue(mockTables);

			const res = await app.request("/mysql/tables?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockTables);
			expect(mockDao.getTablesList).toHaveBeenCalledWith("testdb");
		});

		it("should return empty array when no tables exist", async () => {
			mockDao.getTablesList.mockResolvedValue([]);

			const res = await app.request("/mysql/tables?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual([]);
		});

		it("should handle single table response", async () => {
			mockDao.getTablesList.mockResolvedValue([{ tableName: "only_table", rowCount: 10 }]);

			const res = await app.request("/mysql/tables?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toHaveLength(1);
			expect(json.data[0].tableName).toBe("only_table");
		});

		it("should handle large number of tables", async () => {
			const mockTables = Array.from({ length: 100 }, (_, i) => ({
				tableName: `table_${i}`,
				rowCount: i * 100,
			}));

			mockDao.getTablesList.mockResolvedValue(mockTables);

			const res = await app.request("/mysql/tables?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toHaveLength(100);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/tables");
			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws database error", async () => {
			mockDao.getTablesList.mockRejectedValue(
				new Error("Table 'information_schema.tables' doesn't exist"),
			);

			const res = await app.request("/mysql/tables?db=testdb");
			expect(res.status).toBe(500);
		});

		it("should return 503 when MySQL connection fails", async () => {
			mockDao.getTablesList.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3306"));

			const res = await app.request("/mysql/tables?db=testdb");
			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// POST /mysql/tables - Create table
	// ============================================
	describe("POST /mysql/tables", () => {
		it("should create a table and return 200 status", async () => {
			mockDao.createTable.mockResolvedValue(undefined);

			const body = {
				tableName: "new_users",
				fields: [
					{ columnName: "id", columnType: "INT", isPrimaryKey: true },
					{ columnName: "name", columnType: "VARCHAR(255)" },
					{ columnName: "email", columnType: "VARCHAR(255)" },
				],
			};

			const res = await app.request("/mysql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			expect(mockDao.createTable).toHaveBeenCalledWith(
				expect.objectContaining({
					db: "testdb",
					tableData: expect.objectContaining({ tableName: "new_users" }),
				}),
			);
		});

		it("should create a table with MySQL-specific AUTO_INCREMENT column", async () => {
			mockDao.createTable.mockResolvedValue(undefined);

			const body = {
				tableName: "products",
				fields: [
					{ columnName: "id", columnType: "INT", isPrimaryKey: true },
					{ columnName: "product_name", columnType: "VARCHAR(255)" },
					{ columnName: "price", columnType: "DECIMAL(10,2)" },
					{ columnName: "created_at", columnType: "DATETIME" },
				],
			};

			const res = await app.request("/mysql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should create a table with foreign key", async () => {
			mockDao.createTable.mockResolvedValue(undefined);

			const body = {
				tableName: "orders",
				fields: [
					{ columnName: "id", columnType: "INT", isPrimaryKey: true },
					{ columnName: "user_id", columnType: "INT" },
					{ columnName: "total", columnType: "DECIMAL(10,2)" },
				],
				foreignKeys: [
					{
						columnName: "user_id",
						referencedTable: "users",
						referencedColumn: "id",
						onUpdate: "CASCADE",
						onDelete: "CASCADE",
					},
				],
			};

			const res = await app.request("/mysql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should return 400 when tableName is missing", async () => {
			const res = await app.request("/mysql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ fields: [{ columnName: "id", columnType: "INT" }] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when fields array is missing", async () => {
			const res = await app.request("/mysql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "bad_table" }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/tables", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "test_table", fields: [{ columnName: "id", columnType: "INT" }] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws database error", async () => {
			mockDao.createTable.mockRejectedValue(new Error("Table 'new_users' already exists"));

			const res = await app.request("/mysql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "new_users", fields: [{ columnName: "id", columnType: "INT" }] }),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.createTable.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mysql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "test_table", fields: [{ columnName: "id", columnType: "INT" }] }),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// DELETE /mysql/tables/:tableName/columns/:columnName
	// ============================================
	describe("DELETE /mysql/tables/:tableName/columns/:columnName", () => {
		it("should delete a column and return 200", async () => {
			mockDao.deleteColumn.mockResolvedValue({ deletedCount: 0 });

			const res = await app.request("/mysql/tables/users/columns/email?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Column "email" deleted successfully from table "users" with 0 rows deleted');
			expect(mockDao.deleteColumn).toHaveBeenCalledWith({
				tableName: "users",
				columnName: "email",
				cascade: false,
				db: "testdb",
			});
		});

		it("should delete a column with cascade option", async () => {
			mockDao.deleteColumn.mockResolvedValue({ deletedCount: 5 });

			const res = await app.request("/mysql/tables/orders/columns/user_id?db=testdb&cascade=true", {
				method: "DELETE",
			});

			expect(res.status).toBe(200);
			expect(mockDao.deleteColumn).toHaveBeenCalledWith({
				tableName: "orders",
				columnName: "user_id",
				cascade: true,
				db: "testdb",
			});
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/tables/users/columns/email", { method: "DELETE" });
			expect(res.status).toBe(400);
		});

		it("should return 404 when table does not exist", async () => {
			mockDao.deleteColumn.mockRejectedValue(
				new HTTPException(404, { message: 'Table "nonexistent" does not exist' }),
			);

			const res = await app.request("/mysql/tables/nonexistent/columns/email?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});

		it("should return 404 when column does not exist", async () => {
			mockDao.deleteColumn.mockRejectedValue(
				new HTTPException(404, { message: 'Column "nonexistent" does not exist in table "users"' }),
			);

			const res = await app.request("/mysql/tables/users/columns/nonexistent?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.deleteColumn.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mysql/tables/users/columns/email?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// POST /mysql/tables/:tableName/columns
	// ============================================
	describe("POST /mysql/tables/:tableName/columns", () => {
		const body = {
			columnName: "email",
			columnType: "text",
			defaultValue: "'unknown@example.com'",
			isPrimaryKey: false,
			isNullable: false,
			isUnique: true,
			isIdentity: false,
			isArray: false,
		};

		it("should add a column and return 200", async () => {
			mockDao.addColumn.mockResolvedValue(undefined);

			const res = await app.request("/mysql/tables/users/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Column "email" added successfully to table "users"');
			expect(mockDao.addColumn).toHaveBeenCalledWith({ tableName: "users", db: "testdb", ...body });
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/tables/users/columns", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when request body is invalid", async () => {
			const res = await app.request("/mysql/tables/users/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ columnName: "email" }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 404 when table does not exist", async () => {
			mockDao.addColumn.mockRejectedValue(
				new HTTPException(404, { message: 'Table "users" does not exist' }),
			);

			const res = await app.request("/mysql/tables/users/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(404);
		});

		it("should return 409 when column already exists", async () => {
			mockDao.addColumn.mockRejectedValue(
				new HTTPException(409, { message: 'Column "email" already exists in table "users"' }),
			);

			const res = await app.request("/mysql/tables/users/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(409);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.addColumn.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mysql/tables/users/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// PATCH /mysql/tables/:tableName/columns/:columnName/rename
	// ============================================
	describe("PATCH /mysql/tables/:tableName/columns/:columnName/rename", () => {
		it("should rename a column and return 200", async () => {
			mockDao.renameColumn.mockResolvedValue(undefined);

			const res = await app.request("/mysql/tables/users/columns/email/rename?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newColumnName: "email_address" }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Column "email" renamed to "email_address" in table "users"');
			expect(mockDao.renameColumn).toHaveBeenCalledWith({
				tableName: "users",
				columnName: "email",
				db: "testdb",
				newColumnName: "email_address",
			});
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/tables/users/columns/email/rename", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newColumnName: "email_address" }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when request body is invalid", async () => {
			const res = await app.request("/mysql/tables/users/columns/email/rename?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
		});

		it("should return 404 when column does not exist", async () => {
			mockDao.renameColumn.mockRejectedValue(
				new HTTPException(404, { message: 'Column "email" does not exist in table "users"' }),
			);

			const res = await app.request("/mysql/tables/users/columns/email/rename?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newColumnName: "email_address" }),
			});

			expect(res.status).toBe(404);
		});

		it("should return 409 when the new column name already exists", async () => {
			mockDao.renameColumn.mockRejectedValue(
				new HTTPException(409, { message: 'Column "email_address" already exists in table "users"' }),
			);

			const res = await app.request("/mysql/tables/users/columns/email/rename?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newColumnName: "email_address" }),
			});

			expect(res.status).toBe(409);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.renameColumn.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mysql/tables/users/columns/email/rename?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newColumnName: "email_address" }),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// PATCH /mysql/tables/:tableName/columns/:columnName
	// ============================================
	describe("PATCH /mysql/tables/:tableName/columns/:columnName", () => {
		const body = { columnType: "text", isNullable: true, defaultValue: null };

		it("should alter a column and return 200", async () => {
			mockDao.alterColumn.mockResolvedValue(undefined);

			const res = await app.request("/mysql/tables/users/columns/email?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Column "email" updated successfully in table "users"');
			expect(mockDao.alterColumn).toHaveBeenCalledWith({
				tableName: "users",
				columnName: "email",
				db: "testdb",
				...body,
			});
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/tables/users/columns/email", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when request body is invalid", async () => {
			const res = await app.request("/mysql/tables/users/columns/email?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isNullable: true }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 404 when column does not exist", async () => {
			mockDao.alterColumn.mockRejectedValue(
				new HTTPException(404, { message: 'Column "email" does not exist in table "users"' }),
			);

			const res = await app.request("/mysql/tables/users/columns/email?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(404);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.alterColumn.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mysql/tables/users/columns/email?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// GET /mysql/tables/:tableName/columns
	// ============================================
	describe("GET /mysql/tables/:tableName/columns", () => {
		it("should return list of columns with 200 status", async () => {
			const mockColumns: ColumnInfoSchemaType[] = [
				{
					columnName: "id",
					dataType: "number",
					dataTypeLabel: "int",
					isNullable: false,
					columnDefault: null,
					isPrimaryKey: true,
					isForeignKey: false,
					referencedTable: null,
					referencedColumn: null,
					enumValues: null,
				},
				{
					columnName: "name",
					dataType: "text",
					dataTypeLabel: "varchar",
					isNullable: false,
					columnDefault: null,
					isPrimaryKey: false,
					isForeignKey: false,
					referencedTable: null,
					referencedColumn: null,
					enumValues: null,
				},
			];

			mockDao.getTableColumns.mockResolvedValue(mockColumns);

			const res = await app.request("/mysql/tables/users/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockColumns);
			expect(mockDao.getTableColumns).toHaveBeenCalledWith({ tableName: "users", db: "testdb" });
		});

		it("should return columns with foreign key information", async () => {
			const mockColumns: ColumnInfoSchemaType[] = [
				{
					columnName: "user_id",
					dataType: "number",
					dataTypeLabel: "int",
					isNullable: false,
					columnDefault: null,
					isPrimaryKey: false,
					isForeignKey: true,
					referencedTable: "users",
					referencedColumn: "id",
					enumValues: null,
				},
			];

			mockDao.getTableColumns.mockResolvedValue(mockColumns);

			const res = await app.request("/mysql/tables/orders/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].isForeignKey).toBe(true);
			expect(json.data[0].referencedTable).toBe("users");
		});

		it("should return MySQL ENUM columns with enum values", async () => {
			const mockColumns: ColumnInfoSchemaType[] = [
				{
					columnName: "status",
					dataType: "enum",
					dataTypeLabel: "enum",
					isNullable: false,
					columnDefault: "'pending'",
					isPrimaryKey: false,
					isForeignKey: false,
					referencedTable: null,
					referencedColumn: null,
					enumValues: ["pending", "active", "completed", "cancelled"],
				},
			];

			mockDao.getTableColumns.mockResolvedValue(mockColumns);

			const res = await app.request("/mysql/tables/tasks/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].enumValues).toEqual(["pending", "active", "completed", "cancelled"]);
		});

		it("should return MySQL TINYINT(1) as boolean dataType", async () => {
			const mockColumns: ColumnInfoSchemaType[] = [
				{
					columnName: "is_active",
					dataType: "boolean",
					dataTypeLabel: "tinyint",
					isNullable: false,
					columnDefault: "1",
					isPrimaryKey: false,
					isForeignKey: false,
					referencedTable: null,
					referencedColumn: null,
					enumValues: null,
				},
			];

			mockDao.getTableColumns.mockResolvedValue(mockColumns);

			const res = await app.request("/mysql/tables/users/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].dataType).toBe("boolean");
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/tables/users/columns");
			expect(res.status).toBe(400);
		});

		it("should return 404 when table does not exist", async () => {
			mockDao.getTableColumns.mockRejectedValue(
				new HTTPException(404, { message: 'Table "nonexistent" does not exist' }),
			);

			const res = await app.request("/mysql/tables/nonexistent/columns?db=testdb");
			expect(res.status).toBe(404);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.getTableColumns.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mysql/tables/users/columns?db=testdb");
			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// GET /mysql/tables/:tableName/data
	// ============================================
	describe("GET /mysql/tables/:tableName/data", () => {
		const mockDataResponse = {
			data: [
				{ id: 1, name: "John", email: "john@example.com" },
				{ id: 2, name: "Jane", email: "jane@example.com" },
			],
			meta: {
				limit: 50,
				total: 100,
				hasNextPage: true,
				hasPreviousPage: false,
				nextCursor: "eyJ2YWx1ZXMiOnsiaWQiOjJ9LCJzb3J0Q29sdW1ucyI6WyJpZCJdfQ",
				prevCursor: null,
			},
		};

		it("should return table data with default pagination", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.request("/mysql/tables/users/data?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockDataResponse);
			expect(mockDao.getTableData).toHaveBeenCalledWith({
				tableName: "users",
				cursor: undefined,
				limit: 50,
				direction: "asc",
				sort: "",
				order: undefined,
				filters: [],
				db: "testdb",
			});
		});

		it("should handle custom limit parameter", async () => {
			mockDao.getTableData.mockResolvedValue({ ...mockDataResponse, meta: { ...mockDataResponse.meta, limit: 25 } });

			const res = await app.request("/mysql/tables/users/data?db=testdb&limit=25");

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
		});

		it("should handle cursor-based pagination forward", async () => {
			const cursor = "eyJ2YWx1ZXMiOnsiaWQiOjEwfSwic29ydENvbHVtbnMiOlsiaWQiXX0";
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.request(`/mysql/tables/users/data?db=testdb&cursor=${cursor}&direction=asc`);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(expect.objectContaining({ cursor, direction: "asc" }));
		});

		it("should handle cursor-based pagination backward", async () => {
			const cursor = "eyJ2YWx1ZXMiOnsiaWQiOjEwfSwic29ydENvbHVtbnMiOlsiaWQiXX0";
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.request(`/mysql/tables/users/data?db=testdb&cursor=${cursor}&direction=desc`);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(expect.objectContaining({ cursor, direction: "desc" }));
		});

		it("should handle single column sort", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.request("/mysql/tables/users/data?db=testdb&sort=name&order=asc");

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(expect.objectContaining({ sort: "name", order: "asc" }));
		});

		it("should handle multi-column sort as JSON array", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const sortArray = JSON.stringify([
				{ columnName: "name", direction: "asc" },
				{ columnName: "created_at", direction: "desc" },
			]);

			const res = await app.request(`/mysql/tables/users/data?db=testdb&sort=${encodeURIComponent(sortArray)}`);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					sort: [{ columnName: "name", direction: "asc" }, { columnName: "created_at", direction: "desc" }],
				}),
			);
		});

		it("should handle single filter", async () => {
			mockDao.getTableData.mockResolvedValue({ ...mockDataResponse, data: [mockDataResponse.data[0]], meta: { ...mockDataResponse.meta, total: 1 } });

			const filters = JSON.stringify([{ columnName: "name", operator: "=", value: "John" }]);

			const res = await app.request(`/mysql/tables/users/data?db=testdb&filters=${encodeURIComponent(filters)}`);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ filters: [{ columnName: "name", operator: "=", value: "John" }] }),
			);
		});

		it("should handle LIKE filter for MySQL", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const filters = JSON.stringify([{ columnName: "name", operator: "LIKE", value: "%john%" }]);

			const res = await app.request(`/mysql/tables/users/data?db=testdb&filters=${encodeURIComponent(filters)}`);

			expect(res.status).toBe(200);
		});

		it("should return empty data array when table is empty", async () => {
			mockDao.getTableData.mockResolvedValue({
				data: [],
				meta: { limit: 50, total: 0, hasNextPage: false, hasPreviousPage: false, nextCursor: null, prevCursor: null },
			});

			const res = await app.request("/mysql/tables/empty_table/data?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.data).toEqual([]);
			expect(json.data.meta.total).toBe(0);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/tables/users/data");
			expect(res.status).toBe(400);
		});

		it("should return 400 for invalid direction parameter", async () => {
			const res = await app.request("/mysql/tables/users/data?db=testdb&direction=invalid");
			expect(res.status).toBe(400);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.getTableData.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mysql/tables/users/data?db=testdb");
			expect(res.status).toBe(503);
		});

		it("should return 500 when DAO throws generic error", async () => {
			mockDao.getTableData.mockRejectedValue(new Error("Unexpected error"));

			const res = await app.request("/mysql/tables/users/data?db=testdb");
			expect(res.status).toBe(500);
		});
	});

	// ============================================
	// Invalid database type validation
	// ============================================
	describe("Invalid database type validation", () => {
		it("should return 400 for invalid database type", async () => {
			const res = await app.request("/invalid/tables?db=testdb");
			expect(res.status).toBe(400);
		});

		it("should return 400 for sqlite database type (not supported)", async () => {
			const res = await app.request("/sqlite/tables?db=testdb");
			expect(res.status).toBe(400);
		});

		it("should return 400 for numeric database type", async () => {
			const res = await app.request("/123/tables?db=testdb");
			expect(res.status).toBe(400);
		});
	});

	// ============================================
	// Response headers
	// ============================================
	describe("Response headers", () => {
		it("should include CORS headers", async () => {
			mockDao.getTablesList.mockResolvedValue([{ tableName: "test", rowCount: 0 }]);

			const res = await app.request("/mysql/tables?db=testdb");
			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("should return JSON content type", async () => {
			mockDao.getTablesList.mockResolvedValue([{ tableName: "test", rowCount: 0 }]);

			const res = await app.request("/mysql/tables?db=testdb");
			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	// ============================================
	// Concurrent requests handling
	// ============================================
	describe("Concurrent requests handling", () => {
		it("should handle multiple concurrent requests to /tables", async () => {
			mockDao.getTablesList.mockResolvedValue([{ tableName: "users", rowCount: 100 }]);

			const requests = Array.from({ length: 10 }, () => app.request("/mysql/tables?db=testdb"));
			const responses = await Promise.all(requests);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}
			expect(mockDao.getTablesList).toHaveBeenCalledTimes(10);
		});
	});

	// ============================================
	// Edge cases
	// ============================================
	describe("Edge cases", () => {
		it("should handle table names with underscores", async () => {
			mockDao.getTableColumns.mockResolvedValue([]);

			const res = await app.request("/mysql/tables/user_profiles/columns?db=testdb");

			expect(mockDao.getTableColumns).toHaveBeenCalledWith({ tableName: "user_profiles", db: "testdb" });
		});

		it("should return 404 for non-existent sub-routes", async () => {
			const res = await app.request("/mysql/tables/users/nonexistent?db=testdb");
			expect(res.status).toBe(404);
		});
	});
});
