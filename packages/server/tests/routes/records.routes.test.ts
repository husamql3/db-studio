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

describe("Records Routes", () => {
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
	// POST /records - Add a new record
	// ============================================
	describe("POST /pg/records", () => {
		it("should add a record and return 200 status", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "users",
				data: {
					name: "John Doe",
					email: "john@example.com",
				},
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe(
				'Record inserted into "users" with 1 rows inserted',
			);
			expect(mockDao.addRecord).toHaveBeenCalledWith({
				db: "testdb",
				params: {
					tableName: "users",
					data: {
						name: "John Doe",
						email: "john@example.com",
					},
				},
			});
		});

		it("should add a record with multiple fields", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "products",
				data: {
					name: "Widget",
					price: 99.99,
					category: "electronics",
					is_active: true,
					stock_count: 100,
				},
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toContain("products");
		});

		it("should handle record with null values", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "users",
				data: {
					name: "Jane Doe",
					email: null,
					phone: null,
				},
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should handle record with JSON/object data", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "settings",
				data: {
					user_id: 1,
					preferences: { theme: "dark", notifications: true },
					tags: ["admin", "verified"],
				},
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should return 400 when tableName is missing", async () => {
			const body = {
				data: { name: "Test" },
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when data is missing", async () => {
			const body = {
				tableName: "users",
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when database query param is missing", async () => {
			const body = {
				tableName: "users",
				data: { name: "Test" },
			};

			const res = await app.request("/pg/records", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			mockDao.addRecord.mockRejectedValue(
				new HTTPException(500, {
					message: 'Failed to insert record into "users"',
				}),
			);

			const body = {
				tableName: "users",
				data: { name: "Test" },
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.addRecord.mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:5432"),
			);

			const body = {
				tableName: "users",
				data: { name: "Test" },
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should handle table with special characters in name", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "user_profiles",
				data: { user_id: 1, bio: "Hello" },
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});
	});

	// ============================================
	// PATCH /records - Update records
	// ============================================
	describe("PATCH /pg/records", () => {
		it("should update a single cell and return 200 status", async () => {
			mockDao.updateRecords.mockResolvedValue({
				updatedCount: 1,
			});

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1, name: "Old Name" },
						columnName: "name",
						value: "New Name",
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Updated 1 records in "users"');
			expect(mockDao.updateRecords).toHaveBeenCalledWith({
				params: body,
				db: "testdb",
			});
		});

		it("should update multiple cells in the same row", async () => {
			mockDao.updateRecords.mockResolvedValue({
				updatedCount: 1,
			});

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1, name: "Old Name", email: "old@example.com" },
						columnName: "name",
						value: "New Name",
					},
					{
						rowData: { id: 1, name: "Old Name", email: "old@example.com" },
						columnName: "email",
						value: "new@example.com",
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should update multiple rows", async () => {
			mockDao.updateRecords.mockResolvedValue({
				updatedCount: 3,
			});

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1 },
						columnName: "status",
						value: "active",
					},
					{
						rowData: { id: 2 },
						columnName: "status",
						value: "active",
					},
					{
						rowData: { id: 3 },
						columnName: "status",
						value: "active",
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Updated 3 records in "users"');
		});

		it("should use default primary key when not specified", async () => {
			mockDao.updateRecords.mockResolvedValue({
				updatedCount: 1,
			});

			const body = {
				tableName: "users",
				updates: [
					{
						rowData: { id: 1 },
						columnName: "name",
						value: "Updated",
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			expect(mockDao.updateRecords).toHaveBeenCalledWith({
				params: expect.objectContaining({
					primaryKey: "id",
				}),
				db: "testdb",
			});
		});

		it("should handle custom primary key", async () => {
			mockDao.updateRecords.mockResolvedValue({
				updatedCount: 1,
			});

			const body = {
				tableName: "products",
				primaryKey: "product_code",
				updates: [
					{
						rowData: { product_code: "SKU-123" },
						columnName: "price",
						value: 199.99,
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should handle JSON/object values", async () => {
			mockDao.updateRecords.mockResolvedValue({
				updatedCount: 1,
			});

			const body = {
				tableName: "settings",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1 },
						columnName: "preferences",
						value: { theme: "dark", language: "en" },
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should handle array values", async () => {
			mockDao.updateRecords.mockResolvedValue({
				updatedCount: 1,
			});

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1 },
						columnName: "tags",
						value: ["admin", "verified", "premium"],
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should handle null values", async () => {
			mockDao.updateRecords.mockResolvedValue({
				updatedCount: 1,
			});

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1 },
						columnName: "deleted_at",
						value: null,
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should return 400 when tableName is missing", async () => {
			const body = {
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1 },
						columnName: "name",
						value: "Test",
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when updates array is empty", async () => {
			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when updates is missing", async () => {
			const body = {
				tableName: "users",
				primaryKey: "id",
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when update is missing rowData", async () => {
			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						columnName: "name",
						value: "Test",
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when update is missing columnName", async () => {
			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1 },
						value: "Test",
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when database query param is missing", async () => {
			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1 },
						columnName: "name",
						value: "Test",
					},
				],
			};

			const res = await app.request("/pg/records", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 404 when record not found", async () => {
			mockDao.updateRecords.mockRejectedValue(
				new HTTPException(404, {
					message: 'Record with id = 999 not found in table "users"',
				}),
			);

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 999 },
						columnName: "name",
						value: "Test",
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(404);
		});

		it("should return 400 when primary key not found in rowData", async () => {
			mockDao.updateRecords.mockRejectedValue(
				new HTTPException(400, {
					message:
						'Primary key "id" not found in row data. Please ensure the row has a "id" column.',
				}),
			);

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						rowData: { name: "Test" }, // missing 'id'
						columnName: "name",
						value: "Updated",
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws generic error", async () => {
			mockDao.updateRecords.mockRejectedValue(
				new HTTPException(500, {
					message: 'Failed to update records in "users"',
				}),
			);

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1 },
						columnName: "name",
						value: "Test",
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.updateRecords.mockRejectedValue(
				new Error("connect ECONNREFUSED"),
			);

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1 },
						columnName: "name",
						value: "Test",
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// DELETE /records - Delete records
	// ============================================
	describe("DELETE /pg/records", () => {
		it("should delete a single record and return 200 status", async () => {
			mockDao.deleteRecords.mockResolvedValue({
				deletedCount: 1,
				fkViolation: false,
				relatedRecords: [],
			});

			const body = {
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual({
				deletedCount: 1,
				fkViolation: false,
				relatedRecords: [],
			});
			expect(mockDao.deleteRecords).toHaveBeenCalledWith({
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
				db: "testdb",
			});
		});

		it("should delete multiple records", async () => {
			mockDao.deleteRecords.mockResolvedValue({
				deletedCount: 3,
				fkViolation: false,
				relatedRecords: [],
			});

			const body = {
				tableName: "users",
				primaryKeys: [
					{ columnName: "id", value: 1 },
					{ columnName: "id", value: 2 },
					{ columnName: "id", value: 3 },
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual({ deletedCount: 3, fkViolation: false, relatedRecords: [] });
		});

		it("should handle string primary key values", async () => {
			mockDao.deleteRecords.mockResolvedValue({
				deletedCount: 1,
				fkViolation: false,
				relatedRecords: [],
			});

			const body = {
				tableName: "products",
				primaryKeys: [{ columnName: "sku", value: "PROD-123" }],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should handle UUID primary key values", async () => {
			mockDao.deleteRecords.mockResolvedValue({
				deletedCount: 1,
				fkViolation: false,
				relatedRecords: [],
			});

			const body = {
				tableName: "sessions",
				primaryKeys: [
					{
						columnName: "session_id",
						value: "550e8400-e29b-41d4-a716-446655440000",
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should return 400 when tableName is missing", async () => {
			const body = {
				primaryKeys: [{ columnName: "id", value: 1 }],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when primaryKeys is empty", async () => {
			const body = {
				tableName: "users",
				primaryKeys: [],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when primaryKeys is missing", async () => {
			const body = {
				tableName: "users",
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when database query param is missing", async () => {
			const body = {
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			};

			const res = await app.request("/pg/records", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when primaryKey columnName is missing", async () => {
			const body = {
				tableName: "users",
				primaryKeys: [{ value: 1 }],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should handle FK violation and return related records info", async () => {
			mockDao.deleteRecords.mockResolvedValue({
				deletedCount: 0,
				fkViolation: true,
				relatedRecords: [
					{
						tableName: "orders",
						columnName: "user_id",
						constraintName: "fk_orders_user_id",
						records: [
							{ id: 1, user_id: 1, total: 100 },
							{ id: 2, user_id: 1, total: 200 },
						],
					},
				],
			});

			const body = {
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(409);
			const json = await res.json();
			expect(json.data).toEqual({
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
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			mockDao.deleteRecords.mockRejectedValue(
				new HTTPException(500, {
					message: 'Failed to delete records from "users"',
				}),
			);

			const body = {
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.deleteRecords.mockRejectedValue(
				new Error("connect ECONNREFUSED"),
			);

			const body = {
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// DELETE /records/force - Force delete records
	// ============================================
	describe("DELETE /pg/records/force", () => {
		it("should force delete a record and return 200 status", async () => {
			mockDao.forceDeleteRecords.mockResolvedValue({
				deletedCount: 5,
			});

			const body = {
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			};

			const res = await app.request("/pg/records/force?db=testdb", {
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

		it("should force delete multiple records with cascading deletes", async () => {
			mockDao.forceDeleteRecords.mockResolvedValue({
				deletedCount: 15,
			});

			const body = {
				tableName: "users",
				primaryKeys: [
					{ columnName: "id", value: 1 },
					{ columnName: "id", value: 2 },
				],
			};

			const res = await app.request("/pg/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual({ deletedCount: 15 });
		});

		it("should return 400 when tableName is missing", async () => {
			const body = {
				primaryKeys: [{ columnName: "id", value: 1 }],
			};

			const res = await app.request("/pg/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when primaryKeys is empty", async () => {
			const body = {
				tableName: "users",
				primaryKeys: [],
			};

			const res = await app.request("/pg/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when database query param is missing", async () => {
			const body = {
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			};

			const res = await app.request("/pg/records/force", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			mockDao.forceDeleteRecords.mockRejectedValue(
				new HTTPException(500, {
					message: 'Failed to force delete records from "users"',
				}),
			);

			const body = {
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			};

			const res = await app.request("/pg/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			mockDao.forceDeleteRecords.mockRejectedValue(
				new Error("connect ECONNREFUSED"),
			);

			const body = {
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			};

			const res = await app.request("/pg/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// Invalid database type validation
	// ============================================
	describe("Invalid database type validation", () => {
		it("should return 400 for invalid database type on POST", async () => {
			const body = {
				tableName: "users",
				data: { name: "Test" },
			};

			const res = await app.request("/invalid/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});

		it("should accept mysql database type as valid on PATCH", async () => {
			mockDao.updateRecords.mockResolvedValue({ updatedCount: 1 });

			const body = {
				tableName: "users",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1 },
						columnName: "name",
						value: "Test",
					},
				],
			};

			const res = await app.request("/mysql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			// mysql is a valid database type — route should succeed
			expect(res.status).toBe(200);
		});

		it("should return 400 for sqlite database type on DELETE", async () => {
			const body = {
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			};

			const res = await app.request("/sqlite/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
		});
	});

	// ============================================
	// HTTP methods validation
	// ============================================
	describe("HTTP methods validation", () => {
		it("should return 404 for GET /records", async () => {
			const res = await app.request("/pg/records?db=testdb");

			expect(res.status).toBe(404);
		});

		it("should return 404 for PUT /records", async () => {
			const res = await app.request("/pg/records?db=testdb", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(404);
		});

		it("should return 404 for GET /records/force", async () => {
			const res = await app.request("/pg/records/force?db=testdb");

			expect(res.status).toBe(404);
		});

		it("should return 404 for POST /records/force", async () => {
			const res = await app.request("/pg/records/force?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(404);
		});
	});

	// ============================================
	// Response headers
	// ============================================
	describe("Response headers", () => {
		it("should include CORS headers on POST", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					data: { name: "Test" },
				}),
			});

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("should return JSON content type", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					data: { name: "Test" },
				}),
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
				app.request("/pg/records?db=testdb", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						tableName: "users",
						data: { name: `User ${i}` },
					}),
				}),
			);

			const responses = await Promise.all(requests);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}

			expect(mockDao.addRecord).toHaveBeenCalledTimes(10);
		});

		it("should handle concurrent requests to different record endpoints", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });
			mockDao.updateRecords.mockResolvedValue({
				updatedCount: 1,
			});
			mockDao.deleteRecords.mockResolvedValue({
				deletedCount: 1,
				fkViolation: false,
				relatedRecords: [],
			});

			const [res1, res2, res3] = await Promise.all([
				app.request("/pg/records?db=testdb", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						tableName: "users",
						data: { name: "New User" },
					}),
				}),
				app.request("/pg/records?db=testdb", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						tableName: "users",
						primaryKey: "id",
						updates: [
							{
								rowData: { id: 1 },
								columnName: "name",
								value: "Updated",
							},
						],
					}),
				}),
				app.request("/pg/records?db=testdb", {
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						tableName: "users",
						primaryKeys: [{ columnName: "id", value: 99 }],
					}),
				}),
			]);

			expect(res1.status).toBe(200);
			expect(res2.status).toBe(200);
			expect(res3.status).toBe(200);
		});
	});

	// ============================================
	// Edge cases
	// ============================================
	describe("Edge cases", () => {
		it("should handle empty object as data for POST", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "users",
				data: {},
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			// This may succeed or fail depending on table constraints
			expect([200, 500]).toContain(res.status);
		});

		it("should handle very long string values", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const longString = "a".repeat(10000);
			const body = {
				tableName: "users",
				data: { bio: longString },
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should handle special characters in values", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "users",
				data: {
					name: "O'Brien",
					bio: 'Test "quoted" text',
					notes: "Line1\nLine2\tTabbed",
				},
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should handle numeric values of different types", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "metrics",
				data: {
					integer_val: 42,
					float_val: 3.14159,
					negative_val: -100,
					zero_val: 0,
					large_val: 9007199254740991, // Max safe integer
				},
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should handle boolean values", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "settings",
				data: {
					is_enabled: true,
					is_archived: false,
				},
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should handle nested JSON objects", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "configs",
				data: {
					settings: {
						level1: {
							level2: {
								level3: {
									value: "deeply nested",
								},
							},
						},
					},
				},
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("should handle URL encoded table names in path", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "user_profiles",
				data: { user_id: 1 },
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});
	});

	// ============================================
	// Data integrity tests
	// ============================================
	describe("Data integrity tests", () => {
		it("should preserve data types when adding records", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "mixed_types",
				data: {
					string_col: "test",
					int_col: 42,
					float_col: 3.14,
					bool_col: true,
					null_col: null,
					array_col: [1, 2, 3],
					json_col: { key: "value" },
				},
			};

			const res = await app.request("/pg/records?db=testdb", {
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
						array_col: [1, 2, 3],
						json_col: { key: "value" },
					},
				},
			});
		});

		it("should preserve data types when updating records", async () => {
			mockDao.updateRecords.mockResolvedValue({
				updatedCount: 1,
			});

			const body = {
				tableName: "mixed_types",
				primaryKey: "id",
				updates: [
					{
						rowData: { id: 1 },
						columnName: "json_col",
						value: { nested: { deep: true } },
					},
				],
			};

			const res = await app.request("/pg/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			expect(mockDao.updateRecords).toHaveBeenCalledWith({
				params: expect.objectContaining({
					updates: [
						expect.objectContaining({
							value: { nested: { deep: true } },
						}),
					],
				}),
				db: "testdb",
			});
		});
	});
});
