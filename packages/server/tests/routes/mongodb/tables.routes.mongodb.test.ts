import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";
import type { ColumnInfoSchemaType } from "shared/types";

import { createServer } from "@/utils/create-server.js";
import * as mongoTablesDao from "@/dao/mongo/tables.dao.js";
import * as mongoAddColumnDao from "@/dao/mongo/add-column.mongo.dao.js";
import * as mongoAlterColumnDao from "@/dao/mongo/alter-column.mongo.dao.js";
import * as mongoTableSchemaDao from "@/dao/mongo/table-schema.mongo.dao.js";

// Mock MongoDB DAO modules
vi.mock("@/dao/mongo/tables.dao.js", () => ({
	getMongoTablesList: vi.fn(),
	getMongoTableColumns: vi.fn(),
	getMongoTableData: vi.fn(),
	createMongoCollection: vi.fn(),
	deleteMongoColumn: vi.fn(),
	exportMongoTableData: vi.fn(),
	normalizeMongoDocument: vi.fn((v) => v),
	buildMongoFiltersForQuery: vi.fn(),
	buildMongoSortForQuery: vi.fn(),
	toMongoId: vi.fn((v) => v),
	canCoerceObjectId: vi.fn(() => false),
}));

vi.mock("@/dao/mongo/add-column.mongo.dao.js", () => ({
	addMongoField: vi.fn(),
}));

vi.mock("@/dao/mongo/alter-column.mongo.dao.js", () => ({
	mongoAlterColumn: vi.fn(),
	mongoRenameColumn: vi.fn(),
}));

vi.mock("@/dao/mongo/table-schema.mongo.dao.js", () => ({
	getTableSchema: vi.fn(),
}));

vi.mock("@/dao/mongo/bulk-insert-records.mongo.dao.js", () => ({
	bulkInsertRecords: vi.fn(),
}));

// Stub PG DAO modules imported by tables.routes.ts
vi.mock("@/dao/add-column.dao.js", () => ({ addColumn: vi.fn() }));
vi.mock("@/dao/alter-column.dao.js", () => ({ alterColumn: vi.fn() }));
vi.mock("@/dao/rename-column.dao.js", () => ({ renameColumn: vi.fn() }));
vi.mock("@/dao/table-list.dao.js", () => ({ getTablesList: vi.fn() }));
vi.mock("@/dao/create-table.dao.js", () => ({ createTable: vi.fn() }));
vi.mock("@/dao/delete-column.dao.js", () => ({ deleteColumn: vi.fn() }));
vi.mock("@/dao/table-columns.dao.js", () => ({ getTableColumns: vi.fn() }));
vi.mock("@/dao/tables-data.dao.js", () => ({ getTableData: vi.fn() }));
vi.mock("@/dao/delete-table.dao.js", () => ({ deleteTable: vi.fn() }));
vi.mock("@/dao/table-schema.dao.js", () => ({ getTableSchema: vi.fn() }));
vi.mock("@/dao/export-table.dao.js", () => ({ exportTableData: vi.fn() }));

// Stub MySQL DAO modules
vi.mock("@/dao/mysql/add-column.mysql.dao.js", () => ({ addColumn: vi.fn() }));
vi.mock("@/dao/mysql/alter-column.mysql.dao.js", () => ({ alterColumn: vi.fn() }));
vi.mock("@/dao/mysql/rename-column.mysql.dao.js", () => ({ renameColumn: vi.fn() }));
vi.mock("@/dao/mysql/table-list.mysql.dao.js", () => ({ getTablesList: vi.fn() }));
vi.mock("@/dao/mysql/create-table.mysql.dao.js", () => ({ createTable: vi.fn() }));
vi.mock("@/dao/mysql/delete-column.mysql.dao.js", () => ({ deleteColumn: vi.fn() }));
vi.mock("@/dao/mysql/table-columns.mysql.dao.js", () => ({ getTableColumns: vi.fn() }));
vi.mock("@/dao/mysql/tables-data.mysql.dao.js", () => ({ getTableData: vi.fn() }));
vi.mock("@/dao/mysql/delete-table.mysql.dao.js", () => ({ deleteTable: vi.fn() }));
vi.mock("@/dao/mysql/table-schema.mysql.dao.js", () => ({ getTableSchema: vi.fn() }));
vi.mock("@/dao/mysql/export-table.mysql.dao.js", () => ({ exportTableData: vi.fn() }));

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(),
	getMysqlPool: vi.fn(),
	getMssqlPool: vi.fn(),
	getMongoClient: vi.fn(),
	getMongoDb: vi.fn(() =>
		Promise.resolve({
			collection: vi.fn(() => ({ drop: vi.fn().mockResolvedValue(undefined) })),
		}),
	),
	getMongoDbName: vi.fn(() => "testdb"),
	isValidObjectId: vi.fn(() => false),
	coerceObjectId: vi.fn((v) => v),
	getDbType: vi.fn(() => "mongodb"),
}));

describe("Tables Routes (MongoDB)", () => {
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
	// GET /mongodb/tables - list collections
	// ============================================
	describe("GET /mongodb/tables", () => {
		it("returns list of collections with 200 status", async () => {
			const mockTables = [
				{ tableName: "users", rowCount: 1500 },
				{ tableName: "orders", rowCount: 4200 },
				{ tableName: "products", rowCount: 320 },
			];

			vi.mocked(mongoTablesDao.getMongoTablesList).mockResolvedValue(mockTables);

			const res = await app.request("/mongodb/tables?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockTables);
			expect(mongoTablesDao.getMongoTablesList).toHaveBeenCalledTimes(1);
		});

		it("returns empty array when no collections exist", async () => {
			vi.mocked(mongoTablesDao.getMongoTablesList).mockResolvedValue([]);

			const res = await app.request("/mongodb/tables?db=emptydb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual([]);
		});

		it("returns 400 when db param is missing", async () => {
			const res = await app.request("/mongodb/tables");

			expect(res.status).toBe(400);
		});

		it("returns 500 when DAO throws", async () => {
			vi.mocked(mongoTablesDao.getMongoTablesList).mockRejectedValue(
				new HTTPException(500, { message: "MongoDB error" }),
			);

			const res = await app.request("/mongodb/tables?db=testdb");

			expect(res.status).toBe(500);
		});

		it("returns 503 on connection failure", async () => {
			vi.mocked(mongoTablesDao.getMongoTablesList).mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:27017"),
			);

			const res = await app.request("/mongodb/tables?db=testdb");

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// POST /mongodb/tables - create collection
	// ============================================
	describe("POST /mongodb/tables", () => {
		it("creates a collection with a field definition and returns 200", async () => {
			vi.mocked(mongoTablesDao.createMongoCollection).mockResolvedValue(undefined);

			const res = await app.request("/mongodb/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "events",
					fields: [
						{ columnName: "name", columnType: "string", isNullable: false, isArray: false },
					],
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe("Table events created successfully");
		});

		it("creates a collection with fields and JSON Schema validator", async () => {
			vi.mocked(mongoTablesDao.createMongoCollection).mockResolvedValue(undefined);

			const res = await app.request("/mongodb/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "products",
					fields: [
						{ columnName: "name", columnType: "string", isNullable: false, isArray: false },
						{ columnName: "price", columnType: "double", isNullable: false, isArray: false },
					],
				}),
			});

			expect(res.status).toBe(200);
		});

		it("returns 400 when tableName is missing", async () => {
			const res = await app.request("/mongodb/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					fields: [{ columnName: "name", columnType: "string", isNullable: false, isArray: false }],
				}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 when collection already exists", async () => {
			vi.mocked(mongoTablesDao.createMongoCollection).mockRejectedValue(
				new HTTPException(400, { message: 'Collection "users" already exists' }),
			);

			const res = await app.request("/mongodb/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", fields: [] }),
			});

			expect(res.status).toBe(400);
		});
	});

	// ============================================
	// DELETE /mongodb/tables/:tableName - drop collection
	// ============================================
	describe("DELETE /mongodb/tables/:tableName", () => {
		it("drops a collection and returns 200", async () => {
			const mockDrop = vi.fn().mockResolvedValue(undefined);
			const { getMongoDb } = await import("@/db-manager.js");
			vi.mocked(getMongoDb).mockResolvedValue({
				collection: vi.fn(() => ({ drop: mockDrop })),
			} as never);

			const res = await app.request("/mongodb/tables/users?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(200);
		});

		it("returns 400 when db param is missing", async () => {
			const res = await app.request("/mongodb/tables/users", {
				method: "DELETE",
			});

			expect(res.status).toBe(400);
		});
	});

	// ============================================
	// GET /mongodb/tables/:tableName/columns
	// ============================================
	describe("GET /mongodb/tables/:tableName/columns", () => {
		it("returns collection columns with 200 status", async () => {
			const mockColumns: ColumnInfoSchemaType[] = [
				{
					columnName: "_id",
					dataType: "text",
					dataTypeLabel: "text",
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
					dataTypeLabel: "text",
					isNullable: false,
					columnDefault: null,
					isPrimaryKey: false,
					isForeignKey: false,
					referencedTable: null,
					referencedColumn: null,
					enumValues: null,
				},
				{
					columnName: "age",
					dataType: "number",
					dataTypeLabel: "numeric",
					isNullable: true,
					columnDefault: null,
					isPrimaryKey: false,
					isForeignKey: false,
					referencedTable: null,
					referencedColumn: null,
					enumValues: null,
				},
			];

			vi.mocked(mongoTablesDao.getMongoTableColumns).mockResolvedValue(mockColumns);

			const res = await app.request("/mongodb/tables/users/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockColumns);
			expect(mongoTablesDao.getMongoTableColumns).toHaveBeenCalledWith({
				tableName: "users",
				db: "testdb",
			});
		});

		it("returns empty columns for empty collection", async () => {
			vi.mocked(mongoTablesDao.getMongoTableColumns).mockResolvedValue([]);

			const res = await app.request("/mongodb/tables/empty_coll/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual([]);
		});

		it("returns 503 on connection failure", async () => {
			vi.mocked(mongoTablesDao.getMongoTableColumns).mockRejectedValue(
				new Error("connect ECONNREFUSED"),
			);

			const res = await app.request("/mongodb/tables/users/columns?db=testdb");

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// GET /mongodb/tables/:tableName/data
	// ============================================
	describe("GET /mongodb/tables/:tableName/data", () => {
		it("returns paginated data with 200 status", async () => {
			const mockData = {
				data: [
					{ _id: "507f1f77bcf86cd799439011", name: "Alice", age: 30 },
					{ _id: "507f1f77bcf86cd799439012", name: "Bob", age: 25 },
				],
				meta: {
					limit: 50,
					total: 2,
					hasNextPage: false,
					hasPreviousPage: false,
					nextCursor: null,
					prevCursor: null,
				},
			};

			vi.mocked(mongoTablesDao.getMongoTableData).mockResolvedValue(mockData);

			const res = await app.request("/mongodb/tables/users/data?db=testdb&limit=50");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockData);
			expect(mongoTablesDao.getMongoTableData).toHaveBeenCalledWith(
				expect.objectContaining({ tableName: "users", db: "testdb" }),
			);
		});

		it("passes cursor and direction params to DAO", async () => {
			const mockData = {
				data: [],
				meta: {
					limit: 10,
					total: 100,
					hasNextPage: true,
					hasPreviousPage: true,
					nextCursor: "eyJvZmZzZXQiOjIwfQ",
					prevCursor: "eyJvZmZzZXQiOjB9",
				},
			};

			vi.mocked(mongoTablesDao.getMongoTableData).mockResolvedValue(mockData);

			const res = await app.request(
				"/mongodb/tables/orders/data?db=testdb&limit=10&cursor=eyJvZmZzZXQiOjEwfQ",
			);

			expect(res.status).toBe(200);
			expect(mongoTablesDao.getMongoTableData).toHaveBeenCalledWith(
				expect.objectContaining({ limit: 10, cursor: "eyJvZmZzZXQiOjEwfQ" }),
			);
		});

		it("returns 503 on connection failure", async () => {
			vi.mocked(mongoTablesDao.getMongoTableData).mockRejectedValue(
				new Error("connect ECONNREFUSED"),
			);

			const res = await app.request("/mongodb/tables/users/data?db=testdb");

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// GET /mongodb/tables/:tableName/schema
	// ============================================
	describe("GET /mongodb/tables/:tableName/schema", () => {
		it("returns inferred JSON schema with 200 status", async () => {
			const mockSchema = JSON.stringify(
				{
					collection: "users",
					estimatedDocumentCount: 1500,
					sampledDocuments: 200,
					jsonSchema: {
						bsonType: "object",
						required: ["name", "email"],
						properties: {
							_id: { bsonType: "objectId" },
							name: { bsonType: "string" },
							email: { bsonType: "string" },
							age: { bsonType: ["int", "null"] },
						},
					},
				},
				null,
				2,
			);

			vi.mocked(mongoTableSchemaDao.getTableSchema).mockResolvedValue(mockSchema);

			const res = await app.request("/mongodb/tables/users/schema?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.schema).toBe(mockSchema);
		});

		it("returns 404 when collection does not exist", async () => {
			vi.mocked(mongoTableSchemaDao.getTableSchema).mockRejectedValue(
				new HTTPException(404, { message: 'Collection "ghost" does not exist' }),
			);

			const res = await app.request("/mongodb/tables/ghost/schema?db=testdb");

			expect(res.status).toBe(404);
		});
	});

	// ============================================
	// GET /mongodb/tables/:tableName/export
	// ============================================
	describe("GET /mongodb/tables/:tableName/export", () => {
		it("exports collection data as CSV", async () => {
			vi.mocked(mongoTablesDao.exportMongoTableData).mockResolvedValue({
				cols: ["_id", "name", "email"],
				rows: [{ _id: "1", name: "Alice", email: "alice@example.com" }],
			});

			const res = await app.request(
				"/mongodb/tables/users/export?db=testdb&format=csv",
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toContain("text/csv");
			expect(res.headers.get("Content-Disposition")).toContain("users_export.csv");
		});

		it("exports collection data as JSON", async () => {
			vi.mocked(mongoTablesDao.exportMongoTableData).mockResolvedValue({
				cols: ["_id", "name"],
				rows: [{ _id: "1", name: "Alice" }],
			});

			const res = await app.request(
				"/mongodb/tables/users/export?db=testdb&format=json",
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	// ============================================
	// DELETE /mongodb/tables/:tableName/columns/:columnName
	// ============================================
	describe("DELETE /mongodb/tables/:tableName/columns/:columnName", () => {
		it("deletes a field from all documents and returns 200", async () => {
			vi.mocked(mongoTablesDao.deleteMongoColumn).mockResolvedValue({ deletedCount: 42 });

			const res = await app.request("/mongodb/tables/users/columns/age?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toContain("age");
			expect(json.data).toContain("users");
			expect(mongoTablesDao.deleteMongoColumn).toHaveBeenCalledWith({
				tableName: "users",
				columnName: "age",
				db: "testdb",
				cascade: undefined,
			});
		});

		it("returns 400 when db param is missing", async () => {
			const res = await app.request("/mongodb/tables/users/columns/age", {
				method: "DELETE",
			});

			expect(res.status).toBe(400);
		});

		it("returns 503 on connection failure", async () => {
			vi.mocked(mongoTablesDao.deleteMongoColumn).mockRejectedValue(
				new Error("connect ECONNREFUSED"),
			);

			const res = await app.request("/mongodb/tables/users/columns/age?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// POST /mongodb/tables/:tableName/columns - add field
	// ============================================
	describe("POST /mongodb/tables/:tableName/columns", () => {
		it("adds a field to all documents and returns 200", async () => {
			vi.mocked(mongoAddColumnDao.addMongoField).mockResolvedValue(undefined);

			const res = await app.request("/mongodb/tables/users/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					columnName: "score",
					columnType: "double",
					isNullable: true,
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toContain("score");
			expect(json.data).toContain("users");
			expect(mongoAddColumnDao.addMongoField).toHaveBeenCalledWith(
				expect.objectContaining({ tableName: "users", db: "testdb", columnName: "score" }),
			);
		});

		it("returns 409 when field already exists", async () => {
			vi.mocked(mongoAddColumnDao.addMongoField).mockRejectedValue(
				new HTTPException(409, {
					message: 'Field "score" already exists in collection "users"',
				}),
			);

			const res = await app.request("/mongodb/tables/users/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					columnName: "score",
					columnType: "double",
					isNullable: true,
				}),
			});

			expect(res.status).toBe(409);
		});

		it("returns 404 when collection does not exist", async () => {
			vi.mocked(mongoAddColumnDao.addMongoField).mockRejectedValue(
				new HTTPException(404, { message: 'Collection "ghost" does not exist' }),
			);

			const res = await app.request("/mongodb/tables/ghost/columns?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					columnName: "newField",
					columnType: "string",
					isNullable: true,
				}),
			});

			expect(res.status).toBe(404);
		});
	});

	// ============================================
	// PATCH /mongodb/tables/:tableName/columns/:columnName/rename
	// ============================================
	describe("PATCH /mongodb/tables/:tableName/columns/:columnName/rename", () => {
		it("renames a field across all documents and returns 200", async () => {
			vi.mocked(mongoAlterColumnDao.mongoRenameColumn).mockResolvedValue(undefined);

			const res = await app.request(
				"/mongodb/tables/users/columns/username/rename?db=testdb",
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ newColumnName: "handle" }),
				},
			);

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toContain("username");
			expect(json.data).toContain("handle");
			expect(mongoAlterColumnDao.mongoRenameColumn).toHaveBeenCalledWith(
				expect.objectContaining({
					tableName: "users",
					columnName: "username",
					newColumnName: "handle",
					db: "testdb",
				}),
			);
		});

		it("returns 400 when trying to rename _id field", async () => {
			vi.mocked(mongoAlterColumnDao.mongoRenameColumn).mockRejectedValue(
				new HTTPException(400, { message: 'Cannot rename the "_id" field' }),
			);

			const res = await app.request("/mongodb/tables/users/columns/_id/rename?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newColumnName: "id" }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 404 when field does not exist", async () => {
			vi.mocked(mongoAlterColumnDao.mongoRenameColumn).mockRejectedValue(
				new HTTPException(404, {
					message: 'Field "ghost" does not exist in collection "users"',
				}),
			);

			const res = await app.request(
				"/mongodb/tables/users/columns/ghost/rename?db=testdb",
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ newColumnName: "real" }),
				},
			);

			expect(res.status).toBe(404);
		});

		it("returns 409 when target field already exists", async () => {
			vi.mocked(mongoAlterColumnDao.mongoRenameColumn).mockRejectedValue(
				new HTTPException(409, {
					message: 'Field "email" already exists in collection "users"',
				}),
			);

			const res = await app.request(
				"/mongodb/tables/users/columns/mail/rename?db=testdb",
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ newColumnName: "email" }),
				},
			);

			expect(res.status).toBe(409);
		});
	});

	// ============================================
	// PATCH /mongodb/tables/:tableName/columns/:columnName - alter field
	// ============================================
	describe("PATCH /mongodb/tables/:tableName/columns/:columnName", () => {
		it("updates the field validator and returns 200", async () => {
			vi.mocked(mongoAlterColumnDao.mongoAlterColumn).mockResolvedValue(undefined);

			const res = await app.request("/mongodb/tables/users/columns/age?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ columnType: "int", isNullable: false }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toContain("age");
			expect(mongoAlterColumnDao.mongoAlterColumn).toHaveBeenCalledWith(
				expect.objectContaining({
					tableName: "users",
					columnName: "age",
					columnType: "int",
					isNullable: false,
					db: "testdb",
				}),
			);
		});

		it("returns 400 when trying to alter _id field", async () => {
			vi.mocked(mongoAlterColumnDao.mongoAlterColumn).mockRejectedValue(
				new HTTPException(400, { message: 'Cannot alter the "_id" field' }),
			);

			const res = await app.request("/mongodb/tables/users/columns/_id?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ columnType: "string", isNullable: true }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 404 when collection does not exist", async () => {
			vi.mocked(mongoAlterColumnDao.mongoAlterColumn).mockRejectedValue(
				new HTTPException(404, { message: 'Collection "ghost" does not exist' }),
			);

			const res = await app.request("/mongodb/tables/ghost/columns/field?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ columnType: "string", isNullable: true }),
			});

			expect(res.status).toBe(404);
		});
	});
});
