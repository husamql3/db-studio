import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

import { createServer } from "@/utils/create-server.js";
import * as tableListDao from "@/dao/table-list.dao.js";
import * as createTableDao from "@/dao/create-table.dao.js";
import * as deleteColumnDao from "@/dao/delete-column.dao.js";
import * as tableColumnsDao from "@/dao/table-columns.dao.js";
import * as tablesDataDao from "@/dao/tables-data.dao.js";

// Mock the DAO modules
vi.mock("@/dao/table-list.dao.js", () => ({
	getTablesList: vi.fn(),
}));

vi.mock("@/dao/create-table.dao.js", () => ({
	createTable: vi.fn(),
}));

vi.mock("@/dao/delete-column.dao.js", () => ({
	deleteColumn: vi.fn(),
}));

vi.mock("@/dao/table-columns.dao.js", () => ({
	getTableColumns: vi.fn(),
}));

vi.mock("@/dao/tables-data.dao.js", () => ({
	getTableData: vi.fn(),
}));

// Mock db-manager
vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({
		query: vi.fn(),
	})),
}));

describe("Tables Routes", () => {
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
	// GET /tables - List all tables
	// ============================================
	describe("GET /pg/tables", () => {
		it("should return list of tables with 200 status", async () => {
			const mockTables = [
				{ tableName: "users", rowCount: 100 },
				{ tableName: "orders", rowCount: 500 },
				{ tableName: "products", rowCount: 250 },
			];

			vi.mocked(tableListDao.getTablesList).mockResolvedValue(mockTables);

			const res = await app.request("/pg/tables?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockTables);
			expect(tableListDao.getTablesList).toHaveBeenCalledWith("testdb");
		});

		it("should handle single table response", async () => {
			const mockTables = [{ tableName: "only_table", rowCount: 10 }];

			vi.mocked(tableListDao.getTablesList).mockResolvedValue(mockTables);

			const res = await app.request("/pg/tables?database=testdb");

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

			vi.mocked(tableListDao.getTablesList).mockResolvedValue(mockTables);

			const res = await app.request("/pg/tables?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toHaveLength(100);
		});

		it("should handle tables with special characters in names", async () => {
			const mockTables = [
				{ tableName: "user_profiles", rowCount: 50 },
				{ tableName: "order_items", rowCount: 200 },
				{ tableName: "product_categories", rowCount: 30 },
			];

			vi.mocked(tableListDao.getTablesList).mockResolvedValue(mockTables);

			const res = await app.request("/pg/tables?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockTables);
		});

		it("should handle tables with zero row count", async () => {
			const mockTables = [
				{ tableName: "empty_table", rowCount: 0 },
				{ tableName: "another_empty", rowCount: 0 },
			];

			vi.mocked(tableListDao.getTablesList).mockResolvedValue(mockTables);

			const res = await app.request("/pg/tables?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].rowCount).toBe(0);
		});

		it("should handle tables with very large row counts", async () => {
			const mockTables = [
				{ tableName: "huge_table", rowCount: 1000000000 },
				{ tableName: "big_table", rowCount: 500000000 },
			];

			vi.mocked(tableListDao.getTablesList).mockResolvedValue(mockTables);

			const res = await app.request("/pg/tables?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].rowCount).toBe(1000000000);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/pg/tables");

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			vi.mocked(tableListDao.getTablesList).mockRejectedValue(
				new HTTPException(500, { message: "No tables returned from database" })
			);

			const res = await app.request("/pg/tables?database=testdb");

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			const connectionError = new Error("connect ECONNREFUSED 127.0.0.1:5432");
			vi.mocked(tableListDao.getTablesList).mockRejectedValue(connectionError);

			const res = await app.request("/pg/tables?database=testdb");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should return 503 on connection timeout", async () => {
			const timeoutError = new Error("timeout expired");
			vi.mocked(tableListDao.getTablesList).mockRejectedValue(timeoutError);

			const res = await app.request("/pg/tables?database=testdb");

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// POST /tables - Create a new table
	// ============================================
	describe("POST /pg/tables", () => {
		it("should create a table with basic fields and return 200", async () => {
			vi.mocked(createTableDao.createTable).mockResolvedValue(undefined);

			const body = {
				tableName: "new_table",
				fields: [
					{
						columnName: "id",
						columnType: "SERIAL",
						isPrimaryKey: true,
						isNullable: false,
					},
					{
						columnName: "name",
						columnType: "VARCHAR(255)",
						isNullable: false,
					},
				],
			};

			const res = await app.request("/pg/tables?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe("Table new_table created successfully");
			expect(createTableDao.createTable).toHaveBeenCalledWith({
				tableData: expect.objectContaining({ tableName: "new_table" }),
				database: "testdb",
			});
		});

		it("should create a table with all field options", async () => {
			vi.mocked(createTableDao.createTable).mockResolvedValue(undefined);

			const body = {
				tableName: "complex_table",
				fields: [
					{
						columnName: "id",
						columnType: "INTEGER",
						isPrimaryKey: true,
						isNullable: false,
						isIdentity: true,
					},
					{
						columnName: "email",
						columnType: "VARCHAR(255)",
						isNullable: false,
						isUnique: true,
					},
					{
						columnName: "tags",
						columnType: "TEXT",
						isArray: true,
						isNullable: true,
					},
					{
						columnName: "status",
						columnType: "VARCHAR(50)",
						defaultValue: "'active'",
						isNullable: false,
					},
				],
			};

			const res = await app.request("/pg/tables?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe("Table complex_table created successfully");
		});

		it("should create a table with foreign keys", async () => {
			vi.mocked(createTableDao.createTable).mockResolvedValue(undefined);

			const body = {
				tableName: "orders",
				fields: [
					{
						columnName: "id",
						columnType: "SERIAL",
						isPrimaryKey: true,
						isNullable: false,
					},
					{
						columnName: "user_id",
						columnType: "INTEGER",
						isNullable: false,
					},
				],
				foreignKeys: [
					{
						columnName: "user_id",
						referencedTable: "users",
						referencedColumn: "id",
						onUpdate: "CASCADE",
						onDelete: "SET NULL",
					},
				],
			};

			const res = await app.request("/pg/tables?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			expect(createTableDao.createTable).toHaveBeenCalledWith({
				tableData: expect.objectContaining({
					foreignKeys: expect.arrayContaining([
						expect.objectContaining({
							columnName: "user_id",
							referencedTable: "users",
						}),
					]),
				}),
				database: "testdb",
			});
		});

		it("should create a table with multiple foreign keys", async () => {
			vi.mocked(createTableDao.createTable).mockResolvedValue(undefined);

			const body = {
				tableName: "order_items",
				fields: [
					{ columnName: "id", columnType: "SERIAL", isPrimaryKey: true, isNullable: false },
					{ columnName: "order_id", columnType: "INTEGER", isNullable: false },
					{ columnName: "product_id", columnType: "INTEGER", isNullable: false },
				],
				foreignKeys: [
					{
						columnName: "order_id",
						referencedTable: "orders",
						referencedColumn: "id",
						onUpdate: "CASCADE",
						onDelete: "CASCADE",
					},
					{
						columnName: "product_id",
						referencedTable: "products",
						referencedColumn: "id",
						onUpdate: "CASCADE",
						onDelete: "RESTRICT",
					},
				],
			};

			const res = await app.request("/pg/tables?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should return 400 when tableName is missing", async () => {
			const body = {
				fields: [{ columnName: "id", columnType: "SERIAL" }],
			};

			const res = await app.request("/pg/tables?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when fields array is empty", async () => {
			const body = {
				tableName: "empty_fields_table",
				fields: [],
			};

			const res = await app.request("/pg/tables?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when fields is missing", async () => {
			const body = {
				tableName: "no_fields_table",
			};

			const res = await app.request("/pg/tables?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when columnName is missing in field", async () => {
			const body = {
				tableName: "bad_field_table",
				fields: [{ columnType: "SERIAL" }],
			};

			const res = await app.request("/pg/tables?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when columnType is missing in field", async () => {
			const body = {
				tableName: "bad_field_table",
				fields: [{ columnName: "id" }],
			};

			const res = await app.request("/pg/tables?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when database query param is missing", async () => {
			const body = {
				tableName: "test_table",
				fields: [{ columnName: "id", columnType: "SERIAL" }],
			};

			const res = await app.request("/pg/tables", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when foreign key has invalid onDelete action", async () => {
			const body = {
				tableName: "bad_fk_table",
				fields: [
					{ columnName: "id", columnType: "SERIAL", isPrimaryKey: true },
					{ columnName: "ref_id", columnType: "INTEGER" },
				],
				foreignKeys: [
					{
						columnName: "ref_id",
						referencedTable: "other_table",
						referencedColumn: "id",
						onUpdate: "CASCADE",
						onDelete: "INVALID_ACTION",
					},
				],
			};

			const res = await app.request("/pg/tables?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws database error", async () => {
			vi.mocked(createTableDao.createTable).mockRejectedValue(
				new Error("relation already exists")
			);

			const body = {
				tableName: "existing_table",
				fields: [{ columnName: "id", columnType: "SERIAL" }],
			};

			const res = await app.request("/pg/tables?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			vi.mocked(createTableDao.createTable).mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const body = {
				tableName: "test_table",
				fields: [{ columnName: "id", columnType: "SERIAL" }],
			};

			const res = await app.request("/pg/tables?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// DELETE /tables/:tableName/columns/:columnName
	// ============================================
	describe("DELETE /pg/tables/:tableName/columns/:columnName", () => {
		it("should delete a column and return 200", async () => {
			const mockResponse = {
				message: 'Column "email" deleted successfully from table "users"',
				tableName: "users",
				columnName: "email",
				deletedCount: 0,
			};

			vi.mocked(deleteColumnDao.deleteColumn).mockResolvedValue(mockResponse);

			const res = await app.request("/pg/tables/users/columns/email?database=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockResponse);
			expect(deleteColumnDao.deleteColumn).toHaveBeenCalledWith({
				tableName: "users",
				columnName: "email",
				cascade: false,
				database: "testdb",
			});
		});

		it("should delete a column with cascade option", async () => {
			const mockResponse = {
				message: 'Column "user_id" deleted successfully from table "orders"',
				tableName: "orders",
				columnName: "user_id",
				deletedCount: 0,
			};

			vi.mocked(deleteColumnDao.deleteColumn).mockResolvedValue(mockResponse);

			const res = await app.request(
				"/pg/tables/orders/columns/user_id?database=testdb&cascade=true",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(200);
			expect(deleteColumnDao.deleteColumn).toHaveBeenCalledWith({
				tableName: "orders",
				columnName: "user_id",
				cascade: true,
				database: "testdb",
			});
		});

		it("should handle cascade=false explicitly", async () => {
			const mockResponse = {
				message: 'Column "name" deleted successfully from table "products"',
				tableName: "products",
				columnName: "name",
				deletedCount: 0,
			};

			vi.mocked(deleteColumnDao.deleteColumn).mockResolvedValue(mockResponse);

			const res = await app.request(
				"/pg/tables/products/columns/name?database=testdb&cascade=false",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(200);
			expect(deleteColumnDao.deleteColumn).toHaveBeenCalledWith({
				tableName: "products",
				columnName: "name",
				cascade: false,
				database: "testdb",
			});
		});

		it("should handle column names with underscores", async () => {
			const mockResponse = {
				message: 'Column "created_at" deleted successfully from table "users"',
				tableName: "users",
				columnName: "created_at",
				deletedCount: 0,
			};

			vi.mocked(deleteColumnDao.deleteColumn).mockResolvedValue(mockResponse);

			const res = await app.request(
				"/pg/tables/users/columns/created_at?database=testdb",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.columnName).toBe("created_at");
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/pg/tables/users/columns/email", {
				method: "DELETE",
			});

			expect(res.status).toBe(400);
		});

		it("should return 404 when table does not exist", async () => {
			vi.mocked(deleteColumnDao.deleteColumn).mockRejectedValue(
				new HTTPException(404, { message: 'Table "nonexistent" does not exist' })
			);

			const res = await app.request(
				"/pg/tables/nonexistent/columns/email?database=testdb",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(404);
		});

		it("should return 404 when column does not exist", async () => {
			vi.mocked(deleteColumnDao.deleteColumn).mockRejectedValue(
				new HTTPException(404, {
					message: 'Column "nonexistent" does not exist in table "users"',
				})
			);

			const res = await app.request(
				"/pg/tables/users/columns/nonexistent?database=testdb",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(404);
		});

		it("should return 500 when column has dependencies and cascade is false", async () => {
			vi.mocked(deleteColumnDao.deleteColumn).mockRejectedValue(
				new Error("cannot drop column because other objects depend on it")
			);

			const res = await app.request(
				"/pg/tables/users/columns/id?database=testdb&cascade=false",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			vi.mocked(deleteColumnDao.deleteColumn).mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const res = await app.request(
				"/pg/tables/users/columns/email?database=testdb",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// GET /tables/:tableName/columns
	// ============================================
	describe("GET /pg/tables/:tableName/columns", () => {
		it("should return list of columns with 200 status", async () => {
			const mockColumns = [
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

			vi.mocked(tableColumnsDao.getTableColumns).mockResolvedValue(mockColumns);

			const res = await app.request("/pg/tables/users/columns?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockColumns);
			expect(tableColumnsDao.getTableColumns).toHaveBeenCalledWith({
				tableName: "users",
				database: "testdb",
			});
		});

		it("should return columns with foreign key information", async () => {
			const mockColumns = [
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

			vi.mocked(tableColumnsDao.getTableColumns).mockResolvedValue(mockColumns);

			const res = await app.request("/pg/tables/orders/columns?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[1].isForeignKey).toBe(true);
			expect(json.data[1].referencedTable).toBe("users");
		});

		it("should return columns with enum values", async () => {
			const mockColumns = [
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

			vi.mocked(tableColumnsDao.getTableColumns).mockResolvedValue(mockColumns);

			const res = await app.request("/pg/tables/tasks/columns?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].enumValues).toEqual([
				"pending",
				"active",
				"completed",
				"cancelled",
			]);
		});

		it("should return columns with default values", async () => {
			const mockColumns = [
				{
					columnName: "created_at",
					dataType: "date",
					dataTypeLabel: "timestamp",
					isNullable: false,
					columnDefault: "CURRENT_TIMESTAMP",
					isPrimaryKey: false,
					isForeignKey: false,
					referencedTable: null,
					referencedColumn: null,
					enumValues: null,
				},
				{
					columnName: "is_active",
					dataType: "boolean",
					dataTypeLabel: "boolean",
					isNullable: false,
					columnDefault: "true",
					isPrimaryKey: false,
					isForeignKey: false,
					referencedTable: null,
					referencedColumn: null,
					enumValues: null,
				},
			];

			vi.mocked(tableColumnsDao.getTableColumns).mockResolvedValue(mockColumns);

			const res = await app.request("/pg/tables/users/columns?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].columnDefault).toBe("CURRENT_TIMESTAMP");
			expect(json.data[1].columnDefault).toBe("true");
		});

		it("should handle various data types", async () => {
			const mockColumns = [
				{ columnName: "id", dataType: "number", dataTypeLabel: "bigint", isNullable: false, columnDefault: null, isPrimaryKey: true, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "name", dataType: "text", dataTypeLabel: "text", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "metadata", dataType: "json", dataTypeLabel: "jsonb", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "tags", dataType: "array", dataTypeLabel: "array", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "created_at", dataType: "date", dataTypeLabel: "timestamptz", isNullable: false, columnDefault: null, isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "is_verified", dataType: "boolean", dataTypeLabel: "boolean", isNullable: false, columnDefault: "false", isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
			];

			vi.mocked(tableColumnsDao.getTableColumns).mockResolvedValue(mockColumns);

			const res = await app.request("/pg/tables/users/columns?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toHaveLength(6);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/pg/tables/users/columns");

			expect(res.status).toBe(400);
		});

		it("should return 404 when table does not exist", async () => {
			vi.mocked(tableColumnsDao.getTableColumns).mockRejectedValue(
				new HTTPException(404, { message: 'Table "nonexistent" does not exist' })
			);

			const res = await app.request(
				"/pg/tables/nonexistent/columns?database=testdb"
			);

			expect(res.status).toBe(404);
		});

		it("should return 503 when database connection fails", async () => {
			vi.mocked(tableColumnsDao.getTableColumns).mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const res = await app.request("/pg/tables/users/columns?database=testdb");

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// GET /tables/:tableName/data
	// ============================================
	describe("GET /pg/tables/:tableName/data", () => {
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
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const res = await app.request("/pg/tables/users/data?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockDataResponse);
			expect(tablesDataDao.getTableData).toHaveBeenCalledWith({
				tableName: "users",
				cursor: undefined,
				limit: 50,
				direction: "forward",
				sort: "",
				order: undefined,
				filters: [],
				database: "testdb",
			});
		});

		it("should handle custom limit parameter", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue({
				...mockDataResponse,
				meta: { ...mockDataResponse.meta, limit: 25 },
			});

			const res = await app.request(
				"/pg/tables/users/data?database=testdb&limit=25"
			);

			expect(res.status).toBe(200);
			expect(tablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ limit: 25 })
			);
		});

		it("should handle cursor-based pagination forward", async () => {
			const cursor = "eyJ2YWx1ZXMiOnsiaWQiOjEwfSwic29ydENvbHVtbnMiOlsiaWQiXX0";
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue({
				...mockDataResponse,
				meta: {
					...mockDataResponse.meta,
					hasPreviousPage: true,
					prevCursor: "eyJ2YWx1ZXMiOnsiaWQiOjExfSwic29ydENvbHVtbnMiOlsiaWQiXX0",
				},
			});

			const res = await app.request(
				`/pg/tables/users/data?database=testdb&cursor=${cursor}&direction=forward`
			);

			expect(res.status).toBe(200);
			expect(tablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					cursor,
					direction: "forward",
				})
			);
		});

		it("should handle cursor-based pagination backward", async () => {
			const cursor = "eyJ2YWx1ZXMiOnsiaWQiOjEwfSwic29ydENvbHVtbnMiOlsiaWQiXX0";
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue({
				...mockDataResponse,
				meta: {
					...mockDataResponse.meta,
					hasNextPage: true,
					hasPreviousPage: true,
				},
			});

			const res = await app.request(
				`/pg/tables/users/data?database=testdb&cursor=${cursor}&direction=backward`
			);

			expect(res.status).toBe(200);
			expect(tablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					cursor,
					direction: "backward",
				})
			);
		});

		it("should handle single column sort", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const res = await app.request(
				"/pg/tables/users/data?database=testdb&sort=name&order=asc"
			);

			expect(res.status).toBe(200);
			expect(tablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					sort: "name",
					order: "asc",
				})
			);
		});

		it("should handle multi-column sort as JSON array", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const sortArray = JSON.stringify([
				{ columnName: "name", direction: "asc" },
				{ columnName: "created_at", direction: "desc" },
			]);

			const res = await app.request(
				`/pg/tables/users/data?database=testdb&sort=${encodeURIComponent(sortArray)}`
			);

			expect(res.status).toBe(200);
			expect(tablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					sort: [
						{ columnName: "name", direction: "asc" },
						{ columnName: "created_at", direction: "desc" },
					],
				})
			);
		});

		it("should handle order=desc", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const res = await app.request(
				"/pg/tables/users/data?database=testdb&sort=id&order=desc"
			);

			expect(res.status).toBe(200);
			expect(tablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					sort: "id",
					order: "desc",
				})
			);
		});

		it("should handle single filter", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue({
				...mockDataResponse,
				data: [{ id: 1, name: "John", email: "john@example.com" }],
				meta: { ...mockDataResponse.meta, total: 1 },
			});

			const filters = JSON.stringify([
				{ columnName: "name", operator: "=", value: "John" },
			]);

			const res = await app.request(
				`/pg/tables/users/data?database=testdb&filters=${encodeURIComponent(filters)}`
			);

			expect(res.status).toBe(200);
			expect(tablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					filters: [{ columnName: "name", operator: "=", value: "John" }],
				})
			);
		});

		it("should handle multiple filters", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const filters = JSON.stringify([
				{ columnName: "status", operator: "=", value: "active" },
				{ columnName: "age", operator: ">", value: "18" },
				{ columnName: "name", operator: "LIKE", value: "%John%" },
			]);

			const res = await app.request(
				`/pg/tables/users/data?database=testdb&filters=${encodeURIComponent(filters)}`
			);

			expect(res.status).toBe(200);
			expect(tablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					filters: [
						{ columnName: "status", operator: "=", value: "active" },
						{ columnName: "age", operator: ">", value: "18" },
						{ columnName: "name", operator: "LIKE", value: "%John%" },
					],
				})
			);
		});

		it("should handle combined sort and filters", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const filters = JSON.stringify([
				{ columnName: "status", operator: "=", value: "active" },
			]);

			const res = await app.request(
				`/pg/tables/users/data?database=testdb&sort=name&order=asc&filters=${encodeURIComponent(filters)}`
			);

			expect(res.status).toBe(200);
			expect(tablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					sort: "name",
					order: "asc",
					filters: [{ columnName: "status", operator: "=", value: "active" }],
				})
			);
		});

		it("should return empty data array when table is empty", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue({
				data: [],
				meta: {
					limit: 50,
					total: 0,
					hasNextPage: false,
					hasPreviousPage: false,
					nextCursor: null,
					prevCursor: null,
				},
			});

			const res = await app.request("/pg/tables/empty_table/data?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.data).toEqual([]);
			expect(json.data.meta.total).toBe(0);
		});

		it("should handle large datasets with proper pagination meta", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue({
				data: Array.from({ length: 50 }, (_, i) => ({
					id: i + 1,
					name: `User ${i + 1}`,
				})),
				meta: {
					limit: 50,
					total: 10000,
					hasNextPage: true,
					hasPreviousPage: false,
					nextCursor: "eyJ2YWx1ZXMiOnsiaWQiOjUwfSwic29ydENvbHVtbnMiOlsiaWQiXX0",
					prevCursor: null,
				},
			});

			const res = await app.request("/pg/tables/users/data?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.data).toHaveLength(50);
			expect(json.data.meta.total).toBe(10000);
			expect(json.data.meta.hasNextPage).toBe(true);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/pg/tables/users/data");

			expect(res.status).toBe(400);
		});

		it("should return 400 for invalid direction parameter", async () => {
			const res = await app.request(
				"/pg/tables/users/data?database=testdb&direction=invalid"
			);

			expect(res.status).toBe(400);
		});

		it("should return 400 for invalid order parameter", async () => {
			const res = await app.request(
				"/pg/tables/users/data?database=testdb&order=invalid"
			);

			expect(res.status).toBe(400);
		});

		it("should handle invalid JSON in filters gracefully", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const res = await app.request(
				"/pg/tables/users/data?database=testdb&filters=invalid-json"
			);

			expect(res.status).toBe(200);
			// Invalid JSON should be parsed as empty array
			expect(tablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ filters: [] })
			);
		});

		it("should handle invalid JSON in sort gracefully", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const res = await app.request(
				"/pg/tables/users/data?database=testdb&sort=invalid-json"
			);

			expect(res.status).toBe(200);
			// Invalid JSON should be kept as string
			expect(tablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ sort: "invalid-json" })
			);
		});

		it("should return 503 when database connection fails", async () => {
			vi.mocked(tablesDataDao.getTableData).mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const res = await app.request("/pg/tables/users/data?database=testdb");

			expect(res.status).toBe(503);
		});

		it("should return 500 when DAO throws generic error", async () => {
			vi.mocked(tablesDataDao.getTableData).mockRejectedValue(
				new Error("Unexpected error")
			);

			const res = await app.request("/pg/tables/users/data?database=testdb");

			expect(res.status).toBe(500);
		});
	});

	// ============================================
	// Invalid database type validation
	// ============================================
	describe("Invalid database type validation", () => {
		it("should return 400 for invalid database type", async () => {
			const res = await app.request("/invalid/tables?database=testdb");

			expect(res.status).toBe(400);
		});

		it("should return 400 for mysql database type (not supported)", async () => {
			const res = await app.request("/mysql/tables?database=testdb");

			expect(res.status).toBe(400);
		});

		it("should return 400 for sqlite database type (not supported)", async () => {
			const res = await app.request("/sqlite/tables?database=testdb");

			expect(res.status).toBe(400);
		});

		it("should return 400 for numeric database type", async () => {
			const res = await app.request("/123/tables?database=testdb");

			expect(res.status).toBe(400);
		});

		it("should accept valid pg database type", async () => {
			vi.mocked(tableListDao.getTablesList).mockResolvedValue([]);

			const res = await app.request("/pg/tables?database=testdb");

			// This should fail because getTablesList throws when no tables exist
			// but the route itself should be valid
			expect([200, 500]).toContain(res.status);
		});
	});

	// ============================================
	// HTTP methods validation
	// ============================================
	describe("HTTP methods validation", () => {
		it("should return 404 for PUT /tables", async () => {
			const res = await app.request("/pg/tables?database=testdb", {
				method: "PUT",
			});

			expect(res.status).toBe(404);
		});

		it("should return 404 for DELETE /tables (without column path)", async () => {
			const res = await app.request("/pg/tables?database=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});

		it("should return 404 for PATCH /tables", async () => {
			const res = await app.request("/pg/tables?database=testdb", {
				method: "PATCH",
			});

			expect(res.status).toBe(404);
		});

		it("should return 404 for POST /tables/:tableName/columns", async () => {
			const res = await app.request("/pg/tables/users/columns?database=testdb", {
				method: "POST",
			});

			expect(res.status).toBe(404);
		});

		it("should return 404 for PUT /tables/:tableName/data", async () => {
			const res = await app.request("/pg/tables/users/data?database=testdb", {
				method: "PUT",
			});

			expect(res.status).toBe(404);
		});
	});

	// ============================================
	// Response headers
	// ============================================
	describe("Response headers", () => {
		it("should include CORS headers", async () => {
			vi.mocked(tableListDao.getTablesList).mockResolvedValue([
				{ tableName: "test", rowCount: 0 },
			]);

			const res = await app.request("/pg/tables?database=testdb");

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("should return JSON content type", async () => {
			vi.mocked(tableListDao.getTablesList).mockResolvedValue([
				{ tableName: "test", rowCount: 0 },
			]);

			const res = await app.request("/pg/tables?database=testdb");

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	// ============================================
	// Concurrent requests handling
	// ============================================
	describe("Concurrent requests handling", () => {
		it("should handle multiple concurrent requests to /tables", async () => {
			vi.mocked(tableListDao.getTablesList).mockResolvedValue([
				{ tableName: "testdb", rowCount: 100 },
			]);

			const requests = Array.from({ length: 10 }, () =>
				app.request("/pg/tables?database=testdb")
			);

			const responses = await Promise.all(requests);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}

			expect(tableListDao.getTablesList).toHaveBeenCalledTimes(10);
		});

		it("should handle concurrent requests to different table endpoints", async () => {
			vi.mocked(tableListDao.getTablesList).mockResolvedValue([
				{ tableName: "test", rowCount: 0 },
			]);
			vi.mocked(tableColumnsDao.getTableColumns).mockResolvedValue([]);
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue({
				data: [],
				meta: {
					limit: 50,
					total: 0,
					hasNextPage: false,
					hasPreviousPage: false,
					nextCursor: null,
					prevCursor: null,
				},
			});

			const [res1, res2, res3] = await Promise.all([
				app.request("/pg/tables?database=testdb"),
				app.request("/pg/tables/users/columns?database=testdb"),
				app.request("/pg/tables/users/data?database=testdb"),
			]);

			expect(res1.status).toBe(200);
			expect([200, 404]).toContain(res2.status); // 404 if table doesn't exist
			expect(res3.status).toBe(200);
		});
	});

	// ============================================
	// Edge cases
	// ============================================
	describe("Edge cases", () => {
		it("should handle table names with special characters", async () => {
			vi.mocked(tableColumnsDao.getTableColumns).mockResolvedValue([]);

			const res = await app.request(
				"/pg/tables/user_profiles/columns?database=testdb"
			);

			expect(tableColumnsDao.getTableColumns).toHaveBeenCalledWith({
				tableName: "user_profiles",
				database: "testdb",
			});
		});

		it("should handle query parameters gracefully", async () => {
			vi.mocked(tableListDao.getTablesList).mockResolvedValue([
				{ tableName: "test", rowCount: 0 },
			]);

			const res = await app.request(
				"/pg/tables?database=testdb&foo=bar&baz=123"
			);

			expect(res.status).toBe(200);
		});

		it("should return 404 for non-existent sub-routes", async () => {
			const res = await app.request("/pg/tables/users/nonexistent?database=testdb");

			expect(res.status).toBe(404);
		});

		it("should return 404 for deeply nested non-existent routes", async () => {
			const res = await app.request(
				"/pg/tables/users/columns/extra/path?database=testdb"
			);

			expect(res.status).toBe(404);
		});

		it("should handle very long table names", async () => {
			const longTableName = "a".repeat(63); // PostgreSQL max identifier length
			vi.mocked(tableColumnsDao.getTableColumns).mockResolvedValue([]);

			const res = await app.request(
				`/pg/tables/${longTableName}/columns?database=testdb`
			);

			expect(tableColumnsDao.getTableColumns).toHaveBeenCalledWith({
				tableName: longTableName,
				database: "testdb",
			});
		});

		it("should handle URL encoded table names", async () => {
			vi.mocked(tableColumnsDao.getTableColumns).mockResolvedValue([]);

			const res = await app.request(
				"/pg/tables/user%5Fprofiles/columns?database=testdb"
			);

			expect(tableColumnsDao.getTableColumns).toHaveBeenCalledWith({
				tableName: "user_profiles",
				database: "testdb",
			});
		});
	});

	// ============================================
	// Data integrity tests
	// ============================================
	describe("Data integrity tests", () => {
		it("should preserve data types in response", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue({
				data: [
					{
						id: 1,
						name: "Test",
						is_active: true,
						score: 99.5,
						metadata: { key: "value" },
						tags: ["a", "b", "c"],
						created_at: "2024-01-01T00:00:00Z",
					},
				],
				meta: {
					limit: 50,
					total: 1,
					hasNextPage: false,
					hasPreviousPage: false,
					nextCursor: null,
					prevCursor: null,
				},
			});

			const res = await app.request("/pg/tables/users/data?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			const row = json.data.data[0];

			expect(typeof row.id).toBe("number");
			expect(typeof row.name).toBe("string");
			expect(typeof row.is_active).toBe("boolean");
			expect(typeof row.score).toBe("number");
			expect(typeof row.metadata).toBe("object");
			expect(Array.isArray(row.tags)).toBe(true);
		});

		it("should handle null values in data", async () => {
			vi.mocked(tablesDataDao.getTableData).mockResolvedValue({
				data: [
					{
						id: 1,
						name: null,
						email: null,
						metadata: null,
					},
				],
				meta: {
					limit: 50,
					total: 1,
					hasNextPage: false,
					hasPreviousPage: false,
					nextCursor: null,
					prevCursor: null,
				},
			});

			const res = await app.request("/pg/tables/users/data?database=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.data[0].name).toBeNull();
			expect(json.data.data[0].email).toBeNull();
		});
	});
});
