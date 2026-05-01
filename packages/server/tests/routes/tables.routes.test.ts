import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";
import type { ColumnInfoSchemaType } from "shared/types";

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

vi.mock("@/dao/dao-factory.js", () => ({
	getDaoFactory: vi.fn(() => mockDao),
	executeDaoMethod: vi.fn(),
}));

// Mock db-manager
vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({
		query: vi.fn(),
	})),
	getMysqlPool: vi.fn(() => ({
		execute: vi.fn(),
	})),
	getDbType: vi.fn(() => "pg"),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
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

			mockDao.getTablesList.mockResolvedValue(mockTables);

			const res = await app.request("/pg/tables?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockTables);
			expect(mockDao.getTablesList).toHaveBeenCalledWith("testdb");
		});

		it("should handle single table response", async () => {
			const mockTables = [{ tableName: "only_table", rowCount: 10 }];

			mockDao.getTablesList.mockResolvedValue(mockTables);

			const res = await app.request("/pg/tables?db=testdb");

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

			const res = await app.request("/pg/tables?db=testdb");

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

			mockDao.getTablesList.mockResolvedValue(mockTables);

			const res = await app.request("/pg/tables?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockTables);
		});

		it("should handle tables with zero row count", async () => {
			const mockTables = [
				{ tableName: "empty_table", rowCount: 0 },
				{ tableName: "another_empty", rowCount: 0 },
			];

			mockDao.getTablesList.mockResolvedValue(mockTables);

			const res = await app.request("/pg/tables?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].rowCount).toBe(0);
		});

		it("should handle tables with very large row counts", async () => {
			const mockTables = [
				{ tableName: "huge_table", rowCount: 1000000000 },
				{ tableName: "big_table", rowCount: 500000000 },
			];

			mockDao.getTablesList.mockResolvedValue(mockTables);

			const res = await app.request("/pg/tables?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].rowCount).toBe(1000000000);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/pg/tables");

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			mockDao.getTablesList.mockRejectedValue(
				new HTTPException(500, { message: "No tables returned from database" })
			);

			const res = await app.request("/pg/tables?db=testdb");

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			const connectionError = new Error("connect ECONNREFUSED 127.0.0.1:5432");
			mockDao.getTablesList.mockRejectedValue(connectionError);

			const res = await app.request("/pg/tables?db=testdb");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should return 503 on connection timeout", async () => {
			const timeoutError = new Error("timeout expired");
			mockDao.getTablesList.mockRejectedValue(timeoutError);

			const res = await app.request("/pg/tables?db=testdb");

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// POST /tables - Create a new table
	// ============================================
	describe("POST /pg/tables", () => {
		it("should create a table with basic fields and return 200", async () => {
			mockDao.createTable.mockResolvedValue(undefined);

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

			const res = await app.request("/pg/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe("Table new_table created successfully");
			expect(mockDao.createTable).toHaveBeenCalledWith({
				tableData: expect.objectContaining({ tableName: "new_table" }),
				db: "testdb",
			});
		});

		it("should create a table with all field options", async () => {
			mockDao.createTable.mockResolvedValue(undefined);

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

			const res = await app.request("/pg/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe("Table complex_table created successfully");
		});

		it("should create a table with foreign keys", async () => {
			mockDao.createTable.mockResolvedValue(undefined);

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

			const res = await app.request("/pg/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			expect(mockDao.createTable).toHaveBeenCalledWith({
				tableData: expect.objectContaining({
					foreignKeys: expect.arrayContaining([
						expect.objectContaining({
							columnName: "user_id",
							referencedTable: "users",
						}),
					]),
				}),
				db: "testdb",
			});
		});

		it("should create a table with multiple foreign keys", async () => {
			mockDao.createTable.mockResolvedValue(undefined);

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

			const res = await app.request("/pg/tables?db=testdb", {
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

			const res = await app.request("/pg/tables?db=testdb", {
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

			const res = await app.request("/pg/tables?db=testdb", {
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

			const res = await app.request("/pg/tables?db=testdb", {
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

			const res = await app.request("/pg/tables?db=testdb", {
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

			const res = await app.request("/pg/tables?db=testdb", {
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

			const res = await app.request("/pg/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws database error", async () => {
			mockDao.createTable.mockRejectedValue(
				new Error("relation already exists")
			);

			const body = {
				tableName: "existing_table",
				fields: [{ columnName: "id", columnType: "SERIAL" }],
			};

			const res = await app.request("/pg/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.createTable.mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const body = {
				tableName: "test_table",
				fields: [{ columnName: "id", columnType: "SERIAL" }],
			};

			const res = await app.request("/pg/tables?db=testdb", {
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
			mockDao.deleteColumn.mockResolvedValue({ deletedCount: 0 });

			const res = await app.request("/pg/tables/users/columns/email?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe(
				'Column "email" deleted successfully from table "users" with 0 rows deleted'
			);
			expect(mockDao.deleteColumn).toHaveBeenCalledWith({
				tableName: "users",
				columnName: "email",
				cascade: false,
				db: "testdb",
			});
		});

		it("should delete a column with cascade option", async () => {
			mockDao.deleteColumn.mockResolvedValue({ deletedCount: 0 });

			const res = await app.request(
				"/pg/tables/orders/columns/user_id?db=testdb&cascade=true",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(200);
			expect(mockDao.deleteColumn).toHaveBeenCalledWith({
				tableName: "orders",
				columnName: "user_id",
				cascade: true,
				db: "testdb",
			});
		});

		it("should handle cascade=false explicitly", async () => {
			mockDao.deleteColumn.mockResolvedValue({ deletedCount: 0 });

			const res = await app.request(
				"/pg/tables/products/columns/name?db=testdb&cascade=false",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(200);
			expect(mockDao.deleteColumn).toHaveBeenCalledWith({
				tableName: "products",
				columnName: "name",
				cascade: false,
				db: "testdb",
			});
		});

		it("should handle column names with underscores", async () => {
			mockDao.deleteColumn.mockResolvedValue({ deletedCount: 0 });

			const res = await app.request(
				"/pg/tables/users/columns/created_at?db=testdb",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe(
				'Column "created_at" deleted successfully from table "users" with 0 rows deleted'
			);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/pg/tables/users/columns/email", {
				method: "DELETE",
			});

			expect(res.status).toBe(400);
		});

		it("should return 404 when table does not exist", async () => {
			mockDao.deleteColumn.mockRejectedValue(
				new HTTPException(404, { message: 'Table "nonexistent" does not exist' })
			);

			const res = await app.request(
				"/pg/tables/nonexistent/columns/email?db=testdb",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(404);
		});

		it("should return 404 when column does not exist", async () => {
			mockDao.deleteColumn.mockRejectedValue(
				new HTTPException(404, {
					message: 'Column "nonexistent" does not exist in table "users"',
				})
			);

			const res = await app.request(
				"/pg/tables/users/columns/nonexistent?db=testdb",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(404);
		});

		it("should return 500 when column has dependencies and cascade is false", async () => {
			mockDao.deleteColumn.mockRejectedValue(
				new Error("cannot drop column because other objects depend on it")
			);

			const res = await app.request(
				"/pg/tables/users/columns/id?db=testdb&cascade=false",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.deleteColumn.mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const res = await app.request(
				"/pg/tables/users/columns/email?db=testdb",
				{ method: "DELETE" }
			);

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// POST /tables/:tableName/columns
	// ============================================
	describe("POST /pg/tables/:tableName/columns", () => {
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
			mockDao.addColumn.mockResolvedValue();

			const res = await app.request("/pg/tables/users/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Column "email" added successfully to table "users"');
			expect(mockDao.addColumn).toHaveBeenCalledWith({
				tableName: "users",
				db: "testdb",
				...body,
			});
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/pg/tables/users/columns", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when request body is invalid", async () => {
			const res = await app.request("/pg/tables/users/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					columnName: "email",
				}),
			});

			expect(res.status).toBe(400);
		});

		it("should return 404 when table does not exist", async () => {
			mockDao.addColumn.mockRejectedValue(
				new HTTPException(404, { message: 'Table "users" does not exist' }),
			);

			const res = await app.request("/pg/tables/users/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(404);
		});

		it("should return 409 when column already exists", async () => {
			mockDao.addColumn.mockRejectedValue(
				new HTTPException(409, {
					message: 'Column "email" already exists in table "users"',
				}),
			);

			const res = await app.request("/pg/tables/users/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(409);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.addColumn.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/pg/tables/users/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// PATCH /tables/:tableName/columns/:columnName/rename
	// ============================================
	describe("PATCH /pg/tables/:tableName/columns/:columnName/rename", () => {
		it("should rename a column and return 200", async () => {
			mockDao.renameColumn.mockResolvedValue();

			const res = await app.request("/pg/tables/users/columns/email/rename?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newColumnName: "email_address" }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe(
				'Column "email" renamed to "email_address" in table "users"',
			);
			expect(mockDao.renameColumn).toHaveBeenCalledWith({
				tableName: "users",
				columnName: "email",
				db: "testdb",
				newColumnName: "email_address",
			});
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/pg/tables/users/columns/email/rename", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newColumnName: "email_address" }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when request body is invalid", async () => {
			const res = await app.request("/pg/tables/users/columns/email/rename?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
		});

		it("should return 404 when column does not exist", async () => {
			mockDao.renameColumn.mockRejectedValue(
				new HTTPException(404, {
					message: 'Column "email" does not exist in table "users"',
				}),
			);

			const res = await app.request("/pg/tables/users/columns/email/rename?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newColumnName: "email_address" }),
			});

			expect(res.status).toBe(404);
		});

		it("should return 409 when the new column name already exists", async () => {
			mockDao.renameColumn.mockRejectedValue(
				new HTTPException(409, {
					message: 'Column "email_address" already exists in table "users"',
				}),
			);

			const res = await app.request("/pg/tables/users/columns/email/rename?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newColumnName: "email_address" }),
			});

			expect(res.status).toBe(409);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.renameColumn.mockRejectedValue(
				new Error("connect ECONNREFUSED"),
			);

			const res = await app.request("/pg/tables/users/columns/email/rename?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newColumnName: "email_address" }),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// PATCH /tables/:tableName/columns/:columnName
	// ============================================
	describe("PATCH /pg/tables/:tableName/columns/:columnName", () => {
		const body = {
			columnType: "text",
			isNullable: true,
			defaultValue: null,
		};

		it("should alter a column and return 200", async () => {
			mockDao.alterColumn.mockResolvedValue();

			const res = await app.request("/pg/tables/users/columns/email?db=testdb", {
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
			const res = await app.request("/pg/tables/users/columns/email", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when request body is invalid", async () => {
			const res = await app.request("/pg/tables/users/columns/email?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isNullable: true }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 404 when column does not exist", async () => {
			mockDao.alterColumn.mockRejectedValue(
				new HTTPException(404, {
					message: 'Column "email" does not exist in table "users"',
				}),
			);

			const res = await app.request("/pg/tables/users/columns/email?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(404);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.alterColumn.mockRejectedValue(
				new Error("connect ECONNREFUSED"),
			);

			const res = await app.request("/pg/tables/users/columns/email?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// GET /tables/:tableName/columns
	// ============================================
	describe("GET /pg/tables/:tableName/columns", () => {
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

			const res = await app.request("/pg/tables/users/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockColumns);
			expect(mockDao.getTableColumns).toHaveBeenCalledWith({
				tableName: "users",
				db: "testdb",
			});
		});

		it("should return columns with foreign key information", async () => {
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

			const res = await app.request("/pg/tables/orders/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[1].isForeignKey).toBe(true);
			expect(json.data[1].referencedTable).toBe("users");
		});

		it("should return columns with enum values", async () => {
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

			const res = await app.request("/pg/tables/tasks/columns?db=testdb");

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
			const mockColumns: ColumnInfoSchemaType[] = [
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

			mockDao.getTableColumns.mockResolvedValue(mockColumns);

			const res = await app.request("/pg/tables/users/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data[0].columnDefault).toBe("CURRENT_TIMESTAMP");
			expect(json.data[1].columnDefault).toBe("true");
		});

		it("should handle various data types", async () => {
			const mockColumns: ColumnInfoSchemaType[] = [
				{ columnName: "id", dataType: "number", dataTypeLabel: "bigint", isNullable: false, columnDefault: null, isPrimaryKey: true, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "name", dataType: "text", dataTypeLabel: "text", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "metadata", dataType: "json", dataTypeLabel: "jsonb", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "tags", dataType: "array", dataTypeLabel: "array", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "created_at", dataType: "date", dataTypeLabel: "timestamptz", isNullable: false, columnDefault: null, isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
				{ columnName: "is_verified", dataType: "boolean", dataTypeLabel: "boolean", isNullable: false, columnDefault: "false", isPrimaryKey: false, isForeignKey: false, referencedTable: null, referencedColumn: null, enumValues: null },
			];

			mockDao.getTableColumns.mockResolvedValue(mockColumns);

			const res = await app.request("/pg/tables/users/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toHaveLength(6);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/pg/tables/users/columns");

			expect(res.status).toBe(400);
		});

		it("should return 404 when table does not exist", async () => {
			mockDao.getTableColumns.mockRejectedValue(
				new HTTPException(404, { message: 'Table "nonexistent" does not exist' })
			);

			const res = await app.request(
				"/pg/tables/nonexistent/columns?db=testdb"
			);

			expect(res.status).toBe(404);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.getTableColumns.mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const res = await app.request("/pg/tables/users/columns?db=testdb");

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
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.request("/pg/tables/users/data?db=testdb");

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
			mockDao.getTableData.mockResolvedValue({
				...mockDataResponse,
				meta: { ...mockDataResponse.meta, limit: 25 },
			});

			const res = await app.request(
				"/pg/tables/users/data?db=testdb&limit=25"
			);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ limit: 25 })
			);
		});

		it("should handle cursor-based pagination forward", async () => {
			const cursor = "eyJ2YWx1ZXMiOnsiaWQiOjEwfSwic29ydENvbHVtbnMiOlsiaWQiXX0";
			mockDao.getTableData.mockResolvedValue({
				...mockDataResponse,
				meta: {
					...mockDataResponse.meta,
					hasPreviousPage: true,
					prevCursor: "eyJ2YWx1ZXMiOnsiaWQiOjExfSwic29ydENvbHVtbnMiOlsiaWQiXX0",
				},
			});

			const res = await app.request(
				`/pg/tables/users/data?db=testdb&cursor=${cursor}&direction=asc`
			);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					cursor,
					direction: "asc",
				})
			);
		});

		it("should handle cursor-based pagination backward", async () => {
			const cursor = "eyJ2YWx1ZXMiOnsiaWQiOjEwfSwic29ydENvbHVtbnMiOlsiaWQiXX0";
			mockDao.getTableData.mockResolvedValue({
				...mockDataResponse,
				meta: {
					...mockDataResponse.meta,
					hasNextPage: true,
					hasPreviousPage: true,
				},
			});

			const res = await app.request(
				`/pg/tables/users/data?db=testdb&cursor=${cursor}&direction=desc`
			);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					cursor,
					direction: "desc",
				})
			);
		});

		it("should handle single column sort", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.request(
				"/pg/tables/users/data?db=testdb&sort=name&order=asc"
			);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					sort: "name",
					order: "asc",
				})
			);
		});

		it("should handle multi-column sort as JSON array", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const sortArray = JSON.stringify([
				{ columnName: "name", direction: "asc" },
				{ columnName: "created_at", direction: "desc" },
			]);

			const res = await app.request(
				`/pg/tables/users/data?db=testdb&sort=${encodeURIComponent(sortArray)}`
			);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					sort: [
						{ columnName: "name", direction: "asc" },
						{ columnName: "created_at", direction: "desc" },
					],
				})
			);
		});

		it("should handle order=desc", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.request(
				"/pg/tables/users/data?db=testdb&sort=id&order=desc"
			);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					sort: "id",
					order: "desc",
				})
			);
		});

		it("should handle single filter", async () => {
			mockDao.getTableData.mockResolvedValue({
				...mockDataResponse,
				data: [{ id: 1, name: "John", email: "john@example.com" }],
				meta: { ...mockDataResponse.meta, total: 1 },
			});

			const filters = JSON.stringify([
				{ columnName: "name", operator: "=", value: "John" },
			]);

			const res = await app.request(
				`/pg/tables/users/data?db=testdb&filters=${encodeURIComponent(filters)}`
			);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					filters: [{ columnName: "name", operator: "=", value: "John" }],
				})
			);
		});

		it("should handle multiple filters", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const filters = JSON.stringify([
				{ columnName: "status", operator: "=", value: "active" },
				{ columnName: "age", operator: ">", value: "18" },
				{ columnName: "name", operator: "LIKE", value: "%John%" },
			]);

			const res = await app.request(
				`/pg/tables/users/data?db=testdb&filters=${encodeURIComponent(filters)}`
			);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
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
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const filters = JSON.stringify([
				{ columnName: "status", operator: "=", value: "active" },
			]);

			const res = await app.request(
				`/pg/tables/users/data?db=testdb&sort=name&order=asc&filters=${encodeURIComponent(filters)}`
			);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					sort: "name",
					order: "asc",
					filters: [{ columnName: "status", operator: "=", value: "active" }],
				})
			);
		});

		it("should return empty data array when table is empty", async () => {
			mockDao.getTableData.mockResolvedValue({
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

			const res = await app.request("/pg/tables/empty_table/data?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.data).toEqual([]);
			expect(json.data.meta.total).toBe(0);
		});

		it("should handle large datasets with proper pagination meta", async () => {
			mockDao.getTableData.mockResolvedValue({
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

			const res = await app.request("/pg/tables/users/data?db=testdb");

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
				"/pg/tables/users/data?db=testdb&direction=invalid"
			);

			expect(res.status).toBe(400);
		});

		it("should return 400 for invalid order parameter", async () => {
			const res = await app.request(
				"/pg/tables/users/data?db=testdb&order=invalid"
			);

			expect(res.status).toBe(400);
		});

		it("should handle invalid JSON in filters gracefully", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.request(
				"/pg/tables/users/data?db=testdb&filters=invalid-json"
			);

			expect(res.status).toBe(200);
			// Invalid JSON should be parsed as empty array
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ filters: [] })
			);
		});

		it("should handle invalid JSON in sort gracefully", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.request(
				"/pg/tables/users/data?db=testdb&sort=invalid-json"
			);

			expect(res.status).toBe(200);
			// Invalid JSON should be kept as string
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ sort: "invalid-json" })
			);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.getTableData.mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const res = await app.request("/pg/tables/users/data?db=testdb");

			expect(res.status).toBe(503);
		});

		it("should return 500 when DAO throws generic error", async () => {
			mockDao.getTableData.mockRejectedValue(
				new Error("Unexpected error")
			);

			const res = await app.request("/pg/tables/users/data?db=testdb");

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

		it("should accept mysql database type as valid", async () => {
			mockDao.getTablesList.mockResolvedValue([]);

			const res = await app.request("/mysql/tables?db=testdb");

			// mysql is a valid database type — route should succeed
			expect([200, 500]).toContain(res.status);
		});

		it("should return 400 for sqlite database type (not supported)", async () => {
			const res = await app.request("/sqlite/tables?db=testdb");

			expect(res.status).toBe(400);
		});

		it("should return 400 for numeric database type", async () => {
			const res = await app.request("/123/tables?db=testdb");

			expect(res.status).toBe(400);
		});

		it("should accept valid pg database type", async () => {
			mockDao.getTablesList.mockResolvedValue([]);

			const res = await app.request("/pg/tables?db=testdb");

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
			const res = await app.request("/pg/tables?db=testdb", {
				method: "PUT",
			});

			expect(res.status).toBe(404);
		});

		it("should return 404 for DELETE /tables (without column path)", async () => {
			const res = await app.request("/pg/tables?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});

		it("should return 404 for PATCH /tables", async () => {
			const res = await app.request("/pg/tables?db=testdb", {
				method: "PATCH",
			});

			expect(res.status).toBe(404);
		});

		it("should return 404 for PUT /tables/:tableName/columns", async () => {
			const res = await app.request("/pg/tables/users/columns?db=testdb", {
				method: "PUT",
			});

			expect(res.status).toBe(404);
		});

		it("should return 404 for PUT /tables/:tableName/data", async () => {
			const res = await app.request("/pg/tables/users/data?db=testdb", {
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
			mockDao.getTablesList.mockResolvedValue([
				{ tableName: "test", rowCount: 0 },
			]);

			const res = await app.request("/pg/tables?db=testdb");

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("should return JSON content type", async () => {
			mockDao.getTablesList.mockResolvedValue([
				{ tableName: "test", rowCount: 0 },
			]);

			const res = await app.request("/pg/tables?db=testdb");

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	// ============================================
	// Concurrent requests handling
	// ============================================
	describe("Concurrent requests handling", () => {
		it("should handle multiple concurrent requests to /tables", async () => {
			mockDao.getTablesList.mockResolvedValue([
				{ tableName: "testdb", rowCount: 100 },
			]);

			const requests = Array.from({ length: 10 }, () =>
				app.request("/pg/tables?db=testdb")
			);

			const responses = await Promise.all(requests);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}

			expect(mockDao.getTablesList).toHaveBeenCalledTimes(10);
		});

		it("should handle concurrent requests to different table endpoints", async () => {
			mockDao.getTablesList.mockResolvedValue([
				{ tableName: "test", rowCount: 0 },
			]);
			mockDao.getTableColumns.mockResolvedValue([]);
			mockDao.getTableData.mockResolvedValue({
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
				app.request("/pg/tables?db=testdb"),
				app.request("/pg/tables/users/columns?db=testdb"),
				app.request("/pg/tables/users/data?db=testdb"),
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
			mockDao.getTableColumns.mockResolvedValue([]);

			const res = await app.request(
				"/pg/tables/user_profiles/columns?db=testdb"
			);

			expect(mockDao.getTableColumns).toHaveBeenCalledWith({
				tableName: "user_profiles",
				db: "testdb",
			});
		});

		it("should handle query parameters gracefully", async () => {
			mockDao.getTablesList.mockResolvedValue([
				{ tableName: "test", rowCount: 0 },
			]);

			const res = await app.request(
				"/pg/tables?db=testdb&foo=bar&baz=123"
			);

			expect(res.status).toBe(200);
		});

		it("should return 404 for non-existent sub-routes", async () => {
			const res = await app.request("/pg/tables/users/nonexistent?db=testdb");

			expect(res.status).toBe(404);
		});

		it("should return 404 for deeply nested non-existent routes", async () => {
			const res = await app.request(
				"/pg/tables/users/columns/extra/path?db=testdb"
			);

			expect(res.status).toBe(404);
		});

		it("should handle very long table names", async () => {
			const longTableName = "a".repeat(63); // PostgreSQL max identifier length
			mockDao.getTableColumns.mockResolvedValue([]);

			const res = await app.request(
				`/pg/tables/${longTableName}/columns?db=testdb`
			);

			expect(mockDao.getTableColumns).toHaveBeenCalledWith({
				tableName: longTableName,
				db: "testdb",
			});
		});

		it("should handle URL encoded table names", async () => {
			mockDao.getTableColumns.mockResolvedValue([]);

			const res = await app.request(
				"/pg/tables/user%5Fprofiles/columns?db=testdb"
			);

			expect(mockDao.getTableColumns).toHaveBeenCalledWith({
				tableName: "user_profiles",
				db: "testdb",
			});
		});
	});

	// ============================================
	// Data integrity tests
	// ============================================
	describe("Data integrity tests", () => {
		it("should preserve data types in response", async () => {
			mockDao.getTableData.mockResolvedValue({
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

			const res = await app.request("/pg/tables/users/data?db=testdb");

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
			mockDao.getTableData.mockResolvedValue({
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

			const res = await app.request("/pg/tables/users/data?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.data[0].name).toBeNull();
			expect(json.data.data[0].email).toBeNull();
		});
	});
});
