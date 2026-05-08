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
	getDbPool: vi.fn(),
	getMysqlPool: vi.fn(),
	getMssqlPool: vi.fn(),
	getMongoClient: vi.fn(),
	getMongoDb: vi.fn(),
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

	describe("GET /mongodb/tables", () => {
		it("returns list of collections with 200 status", async () => {
			const mockTables = [
				{ tableName: "users", rowCount: 1500 },
				{ tableName: "orders", rowCount: 4200 },
				{ tableName: "products", rowCount: 320 },
			];
			mockDao.getTablesList.mockResolvedValue(mockTables);

			const res = await app.request("/mongodb/tables?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockTables);
			expect(mockDao.getTablesList).toHaveBeenCalledTimes(1);
		});

		it("returns empty array when no collections exist", async () => {
			mockDao.getTablesList.mockResolvedValue([]);

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
			mockDao.getTablesList.mockRejectedValue(
				new HTTPException(500, { message: "MongoDB error" }),
			);

			const res = await app.request("/mongodb/tables?db=testdb");

			expect(res.status).toBe(500);
		});

		it("returns 503 on connection failure", async () => {
			mockDao.getTablesList.mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:27017"),
			);

			const res = await app.request("/mongodb/tables?db=testdb");

			expect(res.status).toBe(503);
		});
	});

	describe("POST /mongodb/tables", () => {
		it("creates a collection with a field definition and returns 200", async () => {
			mockDao.createTable.mockResolvedValue(undefined);

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
			mockDao.createTable.mockResolvedValue(undefined);

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
					fields: [
						{ columnName: "name", columnType: "string", isNullable: false, isArray: false },
					],
				}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 when collection already exists", async () => {
			mockDao.createTable.mockRejectedValue(
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

	describe("DELETE /mongodb/tables/:tableName", () => {
		it("drops a collection and returns 200", async () => {
			mockDao.deleteTable.mockResolvedValue({
				deletedCount: 100,
				fkViolation: false,
				relatedRecords: [],
			});

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
			mockDao.getTableColumns.mockResolvedValue(mockColumns);

			const res = await app.request("/mongodb/tables/users/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockColumns);
			expect(mockDao.getTableColumns).toHaveBeenCalledWith({
				tableName: "users",
				db: "testdb",
			});
		});

		it("returns empty columns for empty collection", async () => {
			mockDao.getTableColumns.mockResolvedValue([]);

			const res = await app.request("/mongodb/tables/empty_coll/columns?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual([]);
		});

		it("returns 503 on connection failure", async () => {
			mockDao.getTableColumns.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mongodb/tables/users/columns?db=testdb");

			expect(res.status).toBe(503);
		});
	});

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
			mockDao.getTableData.mockResolvedValue(mockData);

			const res = await app.request("/mongodb/tables/users/data?db=testdb&limit=50");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockData);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
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
			mockDao.getTableData.mockResolvedValue(mockData);

			const res = await app.request(
				"/mongodb/tables/orders/data?db=testdb&limit=10&cursor=eyJvZmZzZXQiOjEwfQ",
			);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ limit: 10, cursor: "eyJvZmZzZXQiOjEwfQ" }),
			);
		});

		it("returns 503 on connection failure", async () => {
			mockDao.getTableData.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mongodb/tables/users/data?db=testdb");

			expect(res.status).toBe(503);
		});
	});

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
			mockDao.getTableSchema.mockResolvedValue(mockSchema);

			const res = await app.request("/mongodb/tables/users/schema?db=testdb");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.schema).toBe(mockSchema);
		});

		it("returns 404 when collection does not exist", async () => {
			mockDao.getTableSchema.mockRejectedValue(
				new HTTPException(404, { message: 'Collection "ghost" does not exist' }),
			);

			const res = await app.request("/mongodb/tables/ghost/schema?db=testdb");

			expect(res.status).toBe(404);
		});
	});

	describe("GET /mongodb/tables/:tableName/export", () => {
		it("exports collection data as CSV", async () => {
			mockDao.exportTableData.mockResolvedValue({
				cols: ["_id", "name", "email"],
				rows: [{ _id: "1", name: "Alice", email: "alice@example.com" }],
			});

			const res = await app.request("/mongodb/tables/users/export?db=testdb&format=csv");

			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toContain("text/csv");
			expect(res.headers.get("Content-Disposition")).toContain("users_export.csv");
		});

		it("exports collection data as JSON", async () => {
			mockDao.exportTableData.mockResolvedValue({
				cols: ["_id", "name"],
				rows: [{ _id: "1", name: "Alice" }],
			});

			const res = await app.request("/mongodb/tables/users/export?db=testdb&format=json");

			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	describe("DELETE /mongodb/tables/:tableName/columns/:columnName", () => {
		it("deletes a field from all documents and returns 200", async () => {
			mockDao.deleteColumn.mockResolvedValue({ deletedCount: 42 });

			const res = await app.request("/mongodb/tables/users/columns/age?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toContain("age");
			expect(json.data).toContain("users");
			expect(mockDao.deleteColumn).toHaveBeenCalledWith({
				tableName: "users",
				columnName: "age",
				db: "testdb",
				cascade: false,
			});
		});

		it("returns 400 when db param is missing", async () => {
			const res = await app.request("/mongodb/tables/users/columns/age", {
				method: "DELETE",
			});

			expect(res.status).toBe(400);
		});

		it("returns 503 on connection failure", async () => {
			mockDao.deleteColumn.mockRejectedValue(new Error("connect ECONNREFUSED"));

			const res = await app.request("/mongodb/tables/users/columns/age?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(503);
		});
	});

	describe("POST /mongodb/tables/:tableName/columns", () => {
		it("adds a field to all documents and returns 200", async () => {
			mockDao.addColumn.mockResolvedValue(undefined);

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
			expect(mockDao.addColumn).toHaveBeenCalledWith(
				expect.objectContaining({ tableName: "users", db: "testdb", columnName: "score" }),
			);
		});

		it("returns 409 when field already exists", async () => {
			mockDao.addColumn.mockRejectedValue(
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
			mockDao.addColumn.mockRejectedValue(
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

	describe("PATCH /mongodb/tables/:tableName/columns/:columnName/rename", () => {
		it("renames a field across all documents and returns 200", async () => {
			mockDao.renameColumn.mockResolvedValue(undefined);

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
			expect(mockDao.renameColumn).toHaveBeenCalledWith(
				expect.objectContaining({
					tableName: "users",
					columnName: "username",
					newColumnName: "handle",
					db: "testdb",
				}),
			);
		});

		it("returns 400 when trying to rename _id field", async () => {
			mockDao.renameColumn.mockRejectedValue(
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
			mockDao.renameColumn.mockRejectedValue(
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
			mockDao.renameColumn.mockRejectedValue(
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

	describe("PATCH /mongodb/tables/:tableName/columns/:columnName", () => {
		it("updates the field validator and returns 200", async () => {
			mockDao.alterColumn.mockResolvedValue(undefined);

			const res = await app.request("/mongodb/tables/users/columns/age?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ columnType: "int", isNullable: false }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toContain("age");
			expect(mockDao.alterColumn).toHaveBeenCalledWith(
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
			mockDao.alterColumn.mockRejectedValue(
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
			mockDao.alterColumn.mockRejectedValue(
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
