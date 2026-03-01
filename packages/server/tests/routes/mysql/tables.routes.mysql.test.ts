import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

import { createServer } from "@/utils/create-server.js";
import * as mysqlTableListDao from "@/dao/mysql/table-list.mysql.dao.js";
import * as mysqlCreateTableDao from "@/dao/mysql/create-table.mysql.dao.js";
import * as mysqlDeleteColumnDao from "@/dao/mysql/delete-column.mysql.dao.js";
import * as mysqlTableColumnsDao from "@/dao/mysql/table-columns.mysql.dao.js";
import * as mysqlTablesDataDao from "@/dao/mysql/tables-data.mysql.dao.js";

// Mock MySQL DAO modules
vi.mock("@/dao/mysql/table-list.mysql.dao.js", () => ({
	getTablesList: vi.fn(),
}));

vi.mock("@/dao/mysql/create-table.mysql.dao.js", () => ({
	createTable: vi.fn(),
}));

vi.mock("@/dao/mysql/delete-column.mysql.dao.js", () => ({
	deleteColumn: vi.fn(),
}));

vi.mock("@/dao/mysql/table-columns.mysql.dao.js", () => ({
	getTableColumns: vi.fn(),
}));

vi.mock("@/dao/mysql/tables-data.mysql.dao.js", () => ({
	getTableData: vi.fn(),
}));

vi.mock("@/dao/mysql/delete-table.mysql.dao.js", () => ({
	deleteTable: vi.fn(),
}));

vi.mock("@/dao/mysql/table-schema.mysql.dao.js", () => ({
	getTableSchema: vi.fn(),
}));

vi.mock("@/dao/mysql/export-table.mysql.dao.js", () => ({
	exportTableData: vi.fn(),
}));

// Mock PG DAO modules (imported by route but not called for /mysql/ paths)
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

vi.mock("@/dao/delete-table.dao.js", () => ({
	deleteTable: vi.fn(),
}));

vi.mock("@/dao/table-schema.dao.js", () => ({
	getTableSchema: vi.fn(),
}));

vi.mock("@/dao/export-table.dao.js", () => ({
	exportTableData: vi.fn(),
}));

// Mock db-manager
vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({ query: vi.fn() })),
	getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
	getDbType: vi.fn(() => "mysql"),
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

			vi.mocked(mysqlTableListDao.getTablesList).mockResolvedValue(mockTables);

			const res = await app.request("/mysql/tables?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockTables);
			expect(mysqlTableListDao.getTablesList).toHaveBeenCalledWith("testdb");
		});

		it("should return empty array when no tables exist", async () => {
			vi.mocked(mysqlTableListDao.getTablesList).mockResolvedValue([]);

			const res = await app.request("/mysql/tables?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual([]);
		});

		it("should handle single table response", async () => {
			const mockTables = [{ tableName: "only_table", rowCount: 10 }];

			vi.mocked(mysqlTableListDao.getTablesList).mockResolvedValue(mockTables);

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

			vi.mocked(mysqlTableListDao.getTablesList).mockResolvedValue(mockTables);

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
			vi.mocked(mysqlTableListDao.getTablesList).mockRejectedValue(
				new Error("Table 'information_schema.tables' doesn't exist")
			);

			const res = await app.request("/mysql/tables?db=testdb");

			expect(res.status).toBe(500);
		});

		it("should return 503 when MySQL connection fails", async () => {
			vi.mocked(mysqlTableListDao.getTablesList).mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:3306")
			);

			const res = await app.request("/mysql/tables?db=testdb");

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// POST /mysql/tables - Create table
	// ============================================
	describe("POST /mysql/tables", () => {
		it("should create a table and return 200 status", async () => {
			vi.mocked(mysqlCreateTableDao.createTable).mockResolvedValue({
				tableName: "new_users",
				message: "Table created successfully",
			});

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
			// Zod schema adds defaults (isNullable, isUnique, etc.) so use objectContaining
			expect(mysqlCreateTableDao.createTable).toHaveBeenCalledWith(
				expect.objectContaining({
					db: "testdb",
					tableData: expect.objectContaining({
						tableName: "new_users",
					}),
				})
			);
		});

		it("should create a table with MySQL-specific AUTO_INCREMENT column", async () => {
			vi.mocked(mysqlCreateTableDao.createTable).mockResolvedValue({
				tableName: "products",
				message: "Table created successfully",
			});

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
			vi.mocked(mysqlCreateTableDao.createTable).mockResolvedValue({
				tableName: "orders",
				message: "Table created successfully",
			});

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
			const body = {
				fields: [{ columnName: "id", columnType: "INT" }],
			};

			const res = await app.request("/mysql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when fields array is missing", async () => {
			const body = {
				tableName: "bad_table",
			};

			const res = await app.request("/mysql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when database query param is missing", async () => {
			const body = {
				tableName: "test_table",
				fields: [{ columnName: "id", columnType: "INT" }],
			};

			const res = await app.request("/mysql/tables", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws database error", async () => {
			vi.mocked(mysqlCreateTableDao.createTable).mockRejectedValue(
				new Error("Table 'new_users' already exists")
			);

			const body = {
				tableName: "new_users",
				fields: [{ columnName: "id", columnType: "INT" }],
			};

			const res = await app.request("/mysql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			vi.mocked(mysqlCreateTableDao.createTable).mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const body = {
				tableName: "test_table",
				fields: [{ columnName: "id", columnType: "INT" }],
			};

			const res = await app.request("/mysql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// DELETE /mysql/tables/:tableName/columns/:columnName
	// ============================================
	describe("DELETE /mysql/tables/:tableName/columns/:columnName", () => {
		it("should delete a column and return 200", async () => {
			vi.mocked(mysqlDeleteColumnDao.deleteColumn).mockResolvedValue({ deletedCount: 0 });

			const res = await app.request("/mysql/tables/users/columns/email?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe(
				'Column "email" deleted successfully from table "users" with 0 rows deleted'
			);
			expect(mysqlDeleteColumnDao.deleteColumn).toHaveBeenCalledWith({
				tableName: "users",
				columnName: "email",
				cascade: false,
				db: "testdb",
			});
		});

		it("should delete a column with cascade option", async () => {
			vi.mocked(mysqlDeleteColumnDao.deleteColumn).mockResolvedValue({ deletedCount: 5 });

			const res = await app.request(
				"/mysql/tables/orders/columns/user_id?db=testdb&cascade=true",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(200);
			expect(mysqlDeleteColumnDao.deleteColumn).toHaveBeenCalledWith({
				tableName: "orders",
				columnName: "user_id",
				cascade: true,
				db: "testdb",
			});
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/tables/users/columns/email", {
				method: "DELETE",
			});

			expect(res.status).toBe(400);
		});

		it("should return 404 when table does not exist", async () => {
			vi.mocked(mysqlDeleteColumnDao.deleteColumn).mockRejectedValue(
				new HTTPException(404, { message: 'Table "nonexistent" does not exist' })
			);

			const res = await app.request(
				"/mysql/tables/nonexistent/columns/email?db=testdb",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(404);
		});

		it("should return 404 when column does not exist", async () => {
			vi.mocked(mysqlDeleteColumnDao.deleteColumn).mockRejectedValue(
				new HTTPException(404, {
					message: 'Column "nonexistent" does not exist in table "users"',
				})
			);

			const res = await app.request(
				"/mysql/tables/users/columns/nonexistent?db=testdb",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(404);
		});

		it("should return 503 when database connection fails", async () => {
			vi.mocked(mysqlDeleteColumnDao.deleteColumn).mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const res = await app.request(
				"/mysql/tables/users/columns/email?db=testdb",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// GET /mysql/tables/:tableName/columns
	// ============================================
	describe("GET /mysql/tables/:tableName/columns", () => {
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

			vi.mocked(mysqlTableColumnsDao.getTableColumns).mockResolvedValue(mockColumns);

			const res = await app.request("/mysql/tables/users/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockColumns);
			expect(mysqlTableColumnsDao.getTableColumns).toHaveBeenCalledWith({
				tableName: "users",
				db: "testdb",
			});
		});

		it("should return columns with foreign key information", async () => {
			const mockColumns = [
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

			vi.mocked(mysqlTableColumnsDao.getTableColumns).mockResolvedValue(mockColumns);

			const res = await app.request("/mysql/tables/orders/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].isForeignKey).toBe(true);
			expect(json.data[0].referencedTable).toBe("users");
		});

		it("should return MySQL ENUM columns with enum values", async () => {
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

			vi.mocked(mysqlTableColumnsDao.getTableColumns).mockResolvedValue(mockColumns);

			const res = await app.request("/mysql/tables/tasks/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].enumValues).toEqual([
				"pending",
				"active",
				"completed",
				"cancelled",
			]);
		});

		it("should return MySQL TINYINT(1) as boolean dataType", async () => {
			const mockColumns = [
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

			vi.mocked(mysqlTableColumnsDao.getTableColumns).mockResolvedValue(mockColumns);

			const res = await app.request("/mysql/tables/users/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].dataType).toBe("boolean");
		});

		it("should handle various MySQL data types", async () => {
			const mockColumns = [
				{ columnName: "id", dataType: "number", dataTypeLabel: "bigint", isNullable: false, columnDefault: null, isPrimaryKey: true, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "name", dataType: "text", dataTypeLabel: "varchar", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "metadata", dataType: "json", dataTypeLabel: "json", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "created_at", dataType: "date", dataTypeLabel: "datetime", isNullable: false, columnDefault: null, isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "is_verified", dataType: "boolean", dataTypeLabel: "tinyint", isNullable: false, columnDefault: "0", isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
			];

			vi.mocked(mysqlTableColumnsDao.getTableColumns).mockResolvedValue(mockColumns);

			const res = await app.request("/mysql/tables/users/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toHaveLength(5);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/tables/users/columns");

			expect(res.status).toBe(400);
		});

		it("should return 404 when table does not exist", async () => {
			vi.mocked(mysqlTableColumnsDao.getTableColumns).mockRejectedValue(
				new HTTPException(404, { message: 'Table "nonexistent" does not exist' })
			);

			const res = await app.request("/mysql/tables/nonexistent/columns?db=testdb");

			expect(res.status).toBe(404);
		});

		it("should return 503 when database connection fails", async () => {
			vi.mocked(mysqlTableColumnsDao.getTableColumns).mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

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
			vi.mocked(mysqlTablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const res = await app.request("/mysql/tables/users/data?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockDataResponse);
			expect(mysqlTablesDataDao.getTableData).toHaveBeenCalledWith({
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
			vi.mocked(mysqlTablesDataDao.getTableData).mockResolvedValue({
				...mockDataResponse,
				meta: { ...mockDataResponse.meta, limit: 25 },
			});

			const res = await app.request("/mysql/tables/users/data?db=testdb&limit=25");

			expect(res.status).toBe(200);
			expect(mysqlTablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ limit: 25 })
			);
		});

		it("should handle cursor-based pagination forward", async () => {
			const cursor = "eyJ2YWx1ZXMiOnsiaWQiOjEwfSwic29ydENvbHVtbnMiOlsiaWQiXX0";
			vi.mocked(mysqlTablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const res = await app.request(
				`/mysql/tables/users/data?db=testdb&cursor=${cursor}&direction=asc`
			);

			expect(res.status).toBe(200);
			expect(mysqlTablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ cursor, direction: "asc" })
			);
		});

		it("should handle cursor-based pagination backward", async () => {
			const cursor = "eyJ2YWx1ZXMiOnsiaWQiOjEwfSwic29ydENvbHVtbnMiOlsiaWQiXX0";
			vi.mocked(mysqlTablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const res = await app.request(
				`/mysql/tables/users/data?db=testdb&cursor=${cursor}&direction=desc`
			);

			expect(res.status).toBe(200);
			expect(mysqlTablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ cursor, direction: "desc" })
			);
		});

		it("should handle single column sort", async () => {
			vi.mocked(mysqlTablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const res = await app.request("/mysql/tables/users/data?db=testdb&sort=name&order=asc");

			expect(res.status).toBe(200);
			expect(mysqlTablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ sort: "name", order: "asc" })
			);
		});

		it("should handle multi-column sort as JSON array", async () => {
			vi.mocked(mysqlTablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const sortArray = JSON.stringify([
				{ columnName: "name", direction: "asc" },
				{ columnName: "created_at", direction: "desc" },
			]);

			const res = await app.request(
				`/mysql/tables/users/data?db=testdb&sort=${encodeURIComponent(sortArray)}`
			);

			expect(res.status).toBe(200);
			expect(mysqlTablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					sort: [
						{ columnName: "name", direction: "asc" },
						{ columnName: "created_at", direction: "desc" },
					],
				})
			);
		});

		it("should handle single filter", async () => {
			vi.mocked(mysqlTablesDataDao.getTableData).mockResolvedValue({
				...mockDataResponse,
				data: [{ id: 1, name: "John", email: "john@example.com" }],
				meta: { ...mockDataResponse.meta, total: 1 },
			});

			const filters = JSON.stringify([
				{ columnName: "name", operator: "=", value: "John" },
			]);

			const res = await app.request(
				`/mysql/tables/users/data?db=testdb&filters=${encodeURIComponent(filters)}`
			);

			expect(res.status).toBe(200);
			expect(mysqlTablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					filters: [{ columnName: "name", operator: "=", value: "John" }],
				})
			);
		});

		it("should handle LIKE filter for MySQL", async () => {
			vi.mocked(mysqlTablesDataDao.getTableData).mockResolvedValue(mockDataResponse);

			const filters = JSON.stringify([
				{ columnName: "name", operator: "LIKE", value: "%john%" },
			]);

			const res = await app.request(
				`/mysql/tables/users/data?db=testdb&filters=${encodeURIComponent(filters)}`
			);

			expect(res.status).toBe(200);
			expect(mysqlTablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					filters: [{ columnName: "name", operator: "LIKE", value: "%john%" }],
				})
			);
		});

		it("should return empty data array when table is empty", async () => {
			vi.mocked(mysqlTablesDataDao.getTableData).mockResolvedValue({
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
			const res = await app.request(
				"/mysql/tables/users/data?db=testdb&direction=invalid"
			);

			expect(res.status).toBe(400);
		});

		it("should return 503 when database connection fails", async () => {
			vi.mocked(mysqlTablesDataDao.getTableData).mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const res = await app.request("/mysql/tables/users/data?db=testdb");

			expect(res.status).toBe(503);
		});

		it("should return 500 when DAO throws generic error", async () => {
			vi.mocked(mysqlTablesDataDao.getTableData).mockRejectedValue(
				new Error("Unexpected error")
			);

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
			vi.mocked(mysqlTableListDao.getTablesList).mockResolvedValue([
				{ tableName: "test", rowCount: 0 },
			]);

			const res = await app.request("/mysql/tables?db=testdb");

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("should return JSON content type", async () => {
			vi.mocked(mysqlTableListDao.getTablesList).mockResolvedValue([
				{ tableName: "test", rowCount: 0 },
			]);

			const res = await app.request("/mysql/tables?db=testdb");

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	// ============================================
	// Concurrent requests handling
	// ============================================
	describe("Concurrent requests handling", () => {
		it("should handle multiple concurrent requests to /tables", async () => {
			vi.mocked(mysqlTableListDao.getTablesList).mockResolvedValue([
				{ tableName: "users", rowCount: 100 },
			]);

			const requests = Array.from({ length: 10 }, () =>
				app.request("/mysql/tables?db=testdb")
			);

			const responses = await Promise.all(requests);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}

			expect(mysqlTableListDao.getTablesList).toHaveBeenCalledTimes(10);
		});
	});

	// ============================================
	// Edge cases
	// ============================================
	describe("Edge cases", () => {
		it("should handle table names with underscores", async () => {
			vi.mocked(mysqlTableColumnsDao.getTableColumns).mockResolvedValue([]);

			const res = await app.request("/mysql/tables/user_profiles/columns?db=testdb");

			expect(mysqlTableColumnsDao.getTableColumns).toHaveBeenCalledWith({
				tableName: "user_profiles",
				db: "testdb",
			});
		});

		it("should return 404 for non-existent sub-routes", async () => {
			const res = await app.request("/mysql/tables/users/nonexistent?db=testdb");

			expect(res.status).toBe(404);
		});
	});
});
