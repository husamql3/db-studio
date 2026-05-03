import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

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

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({ query: vi.fn() })),
	getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
	getDbType: vi.fn(() => "mysql"),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
}));

describe("Records Routes (MySQL)", () => {
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
	// POST /mysql/records - Add a new record
	// ============================================
	describe("POST /mysql/records", () => {
		it("should add a record and return 200 status", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "users",
				data: { name: "John Doe", email: "john@example.com" },
			};

			const res = await app.request("/mysql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Record inserted into "users" with 1 rows inserted');
			expect(mockDao.addRecord).toHaveBeenCalledWith({
				db: "testdb",
				params: { tableName: "users", data: { name: "John Doe", email: "john@example.com" } },
			});
		});

		it("should handle record with all MySQL data types", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "mixed_types",
				data: {
					int_col: 42,
					tinyint_col: 1,
					varchar_col: "hello",
					text_col: "long text value",
					datetime_col: "2024-01-01 00:00:00",
					decimal_col: 9.99,
					json_col: { key: "value" },
					bool_col: true,
				},
			};

			const res = await app.request("/mysql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should handle record with null values", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "users",
				data: { name: "Jane", email: null, bio: null },
			};

			const res = await app.request("/mysql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should return 400 when tableName is missing", async () => {
			const res = await app.request("/mysql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ data: { name: "Test" } }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when data is missing", async () => {
			const res = await app.request("/mysql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users" }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/records", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", data: { name: "Test" } }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			mockDao.addRecord.mockRejectedValue(
				new HTTPException(500, { message: 'Failed to insert record into "users"' }),
			);

			const res = await app.request("/mysql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", data: { name: "Test" } }),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when MySQL connection fails", async () => {
			mockDao.addRecord.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3306"));

			const res = await app.request("/mysql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", data: { name: "Test" } }),
			});

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});
	});

	// ============================================
	// PATCH /mysql/records - Update records
	// ============================================
	describe("PATCH /mysql/records", () => {
		it("should update a single cell and return 200 status", async () => {
			mockDao.updateRecords.mockResolvedValue({ updatedCount: 1 });

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [{ rowData: { id: 1, name: "Old Name" }, columnName: "name", value: "New Name" }],
			};

			const res = await app.request("/mysql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Updated 1 records in "users"');
			expect(mockDao.updateRecords).toHaveBeenCalledWith({ params: body, db: "testdb" });
		});

		it("should update multiple rows", async () => {
			mockDao.updateRecords.mockResolvedValue({ updatedCount: 3 });

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{ rowData: { id: 1 }, columnName: "status", value: "active" },
					{ rowData: { id: 2 }, columnName: "status", value: "active" },
					{ rowData: { id: 3 }, columnName: "status", value: "active" },
				],
			};

			const res = await app.request("/mysql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Updated 3 records in "users"');
		});

		it("should handle JSON object values", async () => {
			mockDao.updateRecords.mockResolvedValue({ updatedCount: 1 });

			const body = {
				tableName: "settings",
				primaryKey: "id",
				updates: [{ rowData: { id: 1 }, columnName: "preferences", value: { theme: "dark" } }],
			};

			const res = await app.request("/mysql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should handle null values", async () => {
			mockDao.updateRecords.mockResolvedValue({ updatedCount: 1 });

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [{ rowData: { id: 1 }, columnName: "deleted_at", value: null }],
			};

			const res = await app.request("/mysql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should use default primary key when not specified", async () => {
			mockDao.updateRecords.mockResolvedValue({ updatedCount: 1 });

			const body = {
				tableName: "users",
				updates: [{ rowData: { id: 1 }, columnName: "name", value: "Updated" }],
			};

			const res = await app.request("/mysql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			expect(mockDao.updateRecords).toHaveBeenCalledWith({
				params: expect.objectContaining({ primaryKey: "id" }),
				db: "testdb",
			});
		});

		it("should return 400 when tableName is missing", async () => {
			const res = await app.request("/mysql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ primaryKey: "id", updates: [{ rowData: { id: 1 }, columnName: "name", value: "Test" }] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when updates array is empty", async () => {
			const res = await app.request("/mysql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKey: "id", updates: [] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/records", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKey: "id", updates: [{ rowData: { id: 1 }, columnName: "name", value: "Test" }] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 404 when record not found", async () => {
			mockDao.updateRecords.mockRejectedValue(
				new HTTPException(404, { message: 'Record with id = 999 not found in table "users"' }),
			);

			const res = await app.request("/mysql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKey: "id", updates: [{ rowData: { id: 999 }, columnName: "name", value: "Test" }] }),
			});

			expect(res.status).toBe(404);
		});

		it("should return 503 when MySQL connection fails", async () => {
			mockDao.updateRecords.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mysql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKey: "id", updates: [{ rowData: { id: 1 }, columnName: "name", value: "Test" }] }),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// DELETE /mysql/records - Delete records
	// ============================================
	describe("DELETE /mysql/records", () => {
		it("should delete a single record and return 200 status", async () => {
			mockDao.deleteRecords.mockResolvedValue({ deletedCount: 1, fkViolation: false, relatedRecords: [] });

			const body = { tableName: "users", primaryKeys: [{ columnName: "id", value: 1 }] };

			const res = await app.request("/mysql/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual({ deletedCount: 1, fkViolation: false, relatedRecords: [] });
			expect(mockDao.deleteRecords).toHaveBeenCalledWith({
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
				db: "testdb",
			});
		});

		it("should delete multiple records", async () => {
			mockDao.deleteRecords.mockResolvedValue({ deletedCount: 3, fkViolation: false, relatedRecords: [] });

			const body = {
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }, { columnName: "id", value: 2 }, { columnName: "id", value: 3 }],
			};

			const res = await app.request("/mysql/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual({ deletedCount: 3, fkViolation: false, relatedRecords: [] });
		});

		it("should handle MySQL FK violation (errno 1451) and return related records", async () => {
			mockDao.deleteRecords.mockResolvedValue({
				deletedCount: 0,
				fkViolation: true,
				relatedRecords: [
					{
						tableName: "orders",
						columnName: "user_id",
						constraintName: "fk_orders_user_id",
						records: [{ id: 1, user_id: 1, total: 100 }, { id: 2, user_id: 1, total: 200 }],
					},
				],
			});

			const body = { tableName: "users", primaryKeys: [{ columnName: "id", value: 1 }] };

			const res = await app.request("/mysql/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(409);
			const json = await res.json();
			expect(json.data.fkViolation).toBe(true);
			expect(json.data.relatedRecords).toHaveLength(1);
			expect(json.data.relatedRecords[0].tableName).toBe("orders");
		});

		it("should return 400 when tableName is missing", async () => {
			const res = await app.request("/mysql/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ primaryKeys: [{ columnName: "id", value: 1 }] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when primaryKeys is empty", async () => {
			const res = await app.request("/mysql/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKeys: [] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/records", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKeys: [{ columnName: "id", value: 1 }] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			mockDao.deleteRecords.mockRejectedValue(
				new HTTPException(500, { message: 'Failed to delete records from "users"' }),
			);

			const res = await app.request("/mysql/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKeys: [{ columnName: "id", value: 1 }] }),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when MySQL connection fails", async () => {
			mockDao.deleteRecords.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mysql/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKeys: [{ columnName: "id", value: 1 }] }),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// DELETE /mysql/records/force - Force delete records
	// ============================================
	describe("DELETE /mysql/records/force", () => {
		it("should force delete a record and return 200 status", async () => {
			mockDao.forceDeleteRecords.mockResolvedValue({ deletedCount: 5 });

			const body = { tableName: "users", primaryKeys: [{ columnName: "id", value: 1 }] };

			const res = await app.request("/mysql/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual({ deletedCount: 5 });
			expect(mockDao.forceDeleteRecords).toHaveBeenCalledWith({
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
				db: "testdb",
			});
		});

		it("should force delete with MySQL FK checks disabled", async () => {
			mockDao.forceDeleteRecords.mockResolvedValue({ deletedCount: 15 });

			const body = {
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }, { columnName: "id", value: 2 }],
			};

			const res = await app.request("/mysql/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual({ deletedCount: 15 });
		});

		it("should return 400 when tableName is missing", async () => {
			const res = await app.request("/mysql/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ primaryKeys: [{ columnName: "id", value: 1 }] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when primaryKeys is empty", async () => {
			const res = await app.request("/mysql/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKeys: [] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/records/force", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKeys: [{ columnName: "id", value: 1 }] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			mockDao.forceDeleteRecords.mockRejectedValue(
				new HTTPException(500, { message: 'Failed to force delete records from "users"' }),
			);

			const res = await app.request("/mysql/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKeys: [{ columnName: "id", value: 1 }] }),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when MySQL connection fails", async () => {
			mockDao.forceDeleteRecords.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mysql/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKeys: [{ columnName: "id", value: 1 }] }),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// POST /mysql/records/bulk - Bulk insert records
	// ============================================
	describe("POST /mysql/records/bulk", () => {
		it("should bulk insert records and return 200 status", async () => {
			mockDao.bulkInsertRecords.mockResolvedValue({
				success: true,
				message: "Bulk insert completed: 3 records inserted",
				successCount: 3,
				failureCount: 0,
			});

			const body = {
				tableName: "users",
				records: [
					{ name: "Alice", email: "alice@example.com" },
					{ name: "Bob", email: "bob@example.com" },
					{ name: "Charlie", email: "charlie@example.com" },
				],
			};

			const res = await app.request("/mysql/records/bulk?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.successCount).toBe(3);
			expect(json.data.failureCount).toBe(0);
		});

		it("should return 400 when tableName is missing", async () => {
			const res = await app.request("/mysql/records/bulk?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ records: [{ name: "Alice" }] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when records array is empty", async () => {
			const res = await app.request("/mysql/records/bulk?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", records: [] }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 503 when MySQL connection fails", async () => {
			mockDao.bulkInsertRecords.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mysql/records/bulk?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", records: [{ name: "Alice" }] }),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// Invalid database type validation
	// ============================================
	describe("Invalid database type validation", () => {
		it("should return 400 for invalid database type on POST", async () => {
			const res = await app.request("/invalid/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", data: { name: "Test" } }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 for sqlite database type on DELETE", async () => {
			const res = await app.request("/sqlite/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", primaryKeys: [{ columnName: "id", value: 1 }] }),
			});

			expect(res.status).toBe(400);
		});
	});

	// ============================================
	// HTTP methods validation
	// ============================================
	describe("HTTP methods validation", () => {
		it("should return 404 for GET /mysql/records", async () => {
			const res = await app.request("/mysql/records?db=testdb");
			expect(res.status).toBe(404);
		});

		it("should return 404 for PUT /mysql/records", async () => {
			const res = await app.request("/mysql/records?db=testdb", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(404);
		});

		it("should return 404 for GET /mysql/records/force", async () => {
			const res = await app.request("/mysql/records/force?db=testdb");
			expect(res.status).toBe(404);
		});
	});

	// ============================================
	// Response headers
	// ============================================
	describe("Response headers", () => {
		it("should include CORS headers on POST", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const res = await app.request("/mysql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", data: { name: "Test" } }),
			});

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("should return JSON content type", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const res = await app.request("/mysql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", data: { name: "Test" } }),
			});

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	// ============================================
	// Concurrent requests handling
	// ============================================
	describe("Concurrent requests handling", () => {
		it("should handle multiple concurrent POST requests", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const requests = Array.from({ length: 10 }, (_, i) =>
				app.request("/mysql/records?db=testdb", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ tableName: "users", data: { name: `User ${i}` } }),
				}),
			);

			const responses = await Promise.all(requests);
			for (const res of responses) {
				expect(res.status).toBe(200);
			}
			expect(mockDao.addRecord).toHaveBeenCalledTimes(10);
		});
	});

	// ============================================
	// Data integrity tests
	// ============================================
	describe("Data integrity tests", () => {
		it("should preserve MySQL data types when adding records", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "mixed_types",
				data: {
					string_col: "test",
					int_col: 42,
					float_col: 3.14,
					bool_col: true,
					null_col: null,
					json_col: { key: "value" },
				},
			};

			const res = await app.request("/mysql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			expect(mockDao.addRecord).toHaveBeenCalledWith({
				db: "testdb",
				params: {
					tableName: "mixed_types",
					data: {
						string_col: "test",
						int_col: 42,
						float_col: 3.14,
						bool_col: true,
						null_col: null,
						json_col: { key: "value" },
					},
				},
			});
		});
	});
});
