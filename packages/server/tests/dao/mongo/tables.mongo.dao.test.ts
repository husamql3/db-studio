import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

// Cursor factory helpers
const createCursor = (data: unknown[] = []) => ({
	sort: vi.fn().mockReturnThis(),
	skip: vi.fn().mockReturnThis(),
	limit: vi.fn().mockReturnThis(),
	toArray: vi.fn().mockResolvedValue(data),
});

let mockCollection: ReturnType<typeof makeMockCollection>;

const makeMockCollection = () => ({
	find: vi.fn(() => createCursor()),
	findOne: vi.fn(),
	countDocuments: vi.fn().mockResolvedValue(0),
	estimatedDocumentCount: vi.fn().mockResolvedValue(0),
	updateMany: vi.fn(),
	drop: vi.fn(),
});

let mockListCollectionsCursor: { toArray: ReturnType<typeof vi.fn> };

const mockDb = {
	collection: vi.fn(() => mockCollection),
	listCollections: vi.fn(() => mockListCollectionsCursor),
	createCollection: vi.fn(),
	command: vi.fn(),
};

vi.mock("@/db-manager.js", () => ({
	getMongoDb: vi.fn(() => Promise.resolve(mockDb)),
	isValidObjectId: vi.fn((v: unknown) => typeof v === "string" && /^[0-9a-f]{24}$/i.test(v)),
	coerceObjectId: vi.fn((v: unknown) => ({ _bsontype: "ObjectId", toHexString: () => v })),
}));

import {
	getMongoTablesList,
	getMongoTableColumns,
	getMongoTableData,
	createMongoCollection,
	deleteMongoColumn,
	exportMongoTableData,
} from "@/dao/mongo/tables.dao.js";

describe("MongoDB Tables DAO", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCollection = makeMockCollection();
		mockDb.collection.mockReturnValue(mockCollection);
		mockListCollectionsCursor = { toArray: vi.fn().mockResolvedValue([]) };
		mockDb.listCollections.mockReturnValue(mockListCollectionsCursor);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ============================================
	// getMongoTablesList
	// ============================================
	describe("getMongoTablesList", () => {
		it("returns a list of collections with their row counts", async () => {
			mockListCollectionsCursor.toArray.mockResolvedValue([
				{ name: "users" },
				{ name: "orders" },
				{ name: "products" },
			]);
			mockCollection.estimatedDocumentCount
				.mockResolvedValueOnce(1500)
				.mockResolvedValueOnce(4200)
				.mockResolvedValueOnce(320);

			const result = await getMongoTablesList("testdb");

			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ tableName: "users", rowCount: 1500 });
			expect(result[1]).toEqual({ tableName: "orders", rowCount: 4200 });
			expect(result[2]).toEqual({ tableName: "products", rowCount: 320 });
		});

		it("returns empty array for empty database", async () => {
			mockListCollectionsCursor.toArray.mockResolvedValue([]);

			const result = await getMongoTablesList("emptydb");

			expect(result).toEqual([]);
		});

		it("calls getMongoDb with the provided db name", async () => {
			mockListCollectionsCursor.toArray.mockResolvedValue([]);
			const { getMongoDb } = await import("@/db-manager.js");

			await getMongoTablesList("customdb");

			expect(getMongoDb).toHaveBeenCalledWith("customdb");
		});
	});

	// ============================================
	// getMongoTableColumns
	// ============================================
	describe("getMongoTableColumns", () => {
		it("infers columns from sampled documents", async () => {
			const docs = [
				{ _id: "id1", name: "Alice", age: 30, active: true },
				{ _id: "id2", name: "Bob", age: 25, active: false },
			];
			mockCollection.find.mockReturnValue(createCursor(docs));

			const result = await getMongoTableColumns({ tableName: "users", db: "testdb" });

			const colNames = result.map((c) => c.columnName);
			expect(colNames).toContain("_id");
			expect(colNames).toContain("name");
			expect(colNames).toContain("age");
			expect(colNames).toContain("active");
		});

		it("marks _id as primary key", async () => {
			const docs = [{ _id: "id1", name: "Alice" }];
			mockCollection.find.mockReturnValue(createCursor(docs));

			const result = await getMongoTableColumns({ tableName: "users", db: "testdb" });

			const idCol = result.find((c) => c.columnName === "_id");
			expect(idCol?.isPrimaryKey).toBe(true);
			expect(idCol?.isForeignKey).toBe(false);
		});

		it("marks non-_id columns as non-primary-key", async () => {
			const docs = [{ _id: "id1", name: "Alice" }];
			mockCollection.find.mockReturnValue(createCursor(docs));

			const result = await getMongoTableColumns({ tableName: "users", db: "testdb" });

			const nameCol = result.find((c) => c.columnName === "name");
			expect(nameCol?.isPrimaryKey).toBe(false);
		});

		it("marks columns nullable when not present in all documents", async () => {
			const docs = [
				{ _id: "id1", name: "Alice", age: 30 },
				{ _id: "id2", name: "Bob" }, // age missing
			];
			mockCollection.find.mockReturnValue(createCursor(docs));

			const result = await getMongoTableColumns({ tableName: "users", db: "testdb" });

			const ageCol = result.find((c) => c.columnName === "age");
			expect(ageCol?.isNullable).toBe(true);
		});

		it("marks columns non-nullable when present in all documents", async () => {
			const docs = [
				{ _id: "id1", name: "Alice" },
				{ _id: "id2", name: "Bob" },
			];
			mockCollection.find.mockReturnValue(createCursor(docs));

			const result = await getMongoTableColumns({ tableName: "users", db: "testdb" });

			const nameCol = result.find((c) => c.columnName === "name");
			expect(nameCol?.isNullable).toBe(false);
		});

		it("infers correct data types for different value types", async () => {
			const docs = [
				{
					_id: "id1",
					text: "hello",
					num: 42,
					flag: true,
					ts: new Date(),
					arr: [1, 2, 3],
					obj: { nested: true },
				},
			];
			mockCollection.find.mockReturnValue(createCursor(docs));

			const result = await getMongoTableColumns({ tableName: "mixed", db: "testdb" });

			const byName = Object.fromEntries(result.map((c) => [c.columnName, c]));
			expect(byName.text.dataType).toBe("text");
			expect(byName.num.dataType).toBe("number");
			expect(byName.flag.dataType).toBe("boolean");
			expect(byName.ts.dataType).toBe("date");
			expect(byName.arr.dataType).toBe("array");
			expect(byName.obj.dataType).toBe("json");
		});

		it("returns at least _id column for empty collection", async () => {
			mockCollection.find.mockReturnValue(createCursor([]));

			const result = await getMongoTableColumns({ tableName: "empty", db: "testdb" });

			expect(result.length).toBeGreaterThanOrEqual(1);
			const idCol = result.find((c) => c.columnName === "_id");
			expect(idCol).toBeDefined();
		});

		it("marks null values as nullable", async () => {
			const docs = [
				{ _id: "id1", notes: null },
				{ _id: "id2", notes: "some text" },
			];
			mockCollection.find.mockReturnValue(createCursor(docs));

			const result = await getMongoTableColumns({ tableName: "users", db: "testdb" });

			const notesCol = result.find((c) => c.columnName === "notes");
			expect(notesCol?.isNullable).toBe(true);
		});
	});

	// ============================================
	// getMongoTableData
	// ============================================
	describe("getMongoTableData", () => {
		it("returns paginated data with meta", async () => {
			const rows = [
				{ _id: "id1", name: "Alice", age: 30 },
				{ _id: "id2", name: "Bob", age: 25 },
			];
			const cursor = createCursor(rows);
			mockCollection.find.mockReturnValue(cursor);
			mockCollection.countDocuments.mockResolvedValue(2);

			const result = await getMongoTableData({
				tableName: "users",
				db: "testdb",
				limit: 50,
			});

			expect(result.data).toHaveLength(2);
			expect(result.meta.total).toBe(2);
			expect(result.meta.hasNextPage).toBe(false);
			expect(result.meta.hasPreviousPage).toBe(false);
		});

		it("sets hasNextPage when more data exists", async () => {
			const rows = Array.from({ length: 10 }, (_, i) => ({ _id: `id${i}`, val: i }));
			mockCollection.find.mockReturnValue(createCursor(rows));
			mockCollection.countDocuments.mockResolvedValue(100);

			const result = await getMongoTableData({
				tableName: "users",
				db: "testdb",
				limit: 10,
			});

			expect(result.meta.hasNextPage).toBe(true);
			expect(result.meta.nextCursor).not.toBeNull();
		});

		it("sets hasPreviousPage when not on first page", async () => {
			const rows = [{ _id: "id11", val: 11 }];
			mockCollection.find.mockReturnValue(createCursor(rows));
			mockCollection.countDocuments.mockResolvedValue(20);

			// Simulate cursor at offset 10
			const cursor = Buffer.from(JSON.stringify({ offset: 10 })).toString("base64url");
			const result = await getMongoTableData({
				tableName: "users",
				db: "testdb",
				limit: 10,
				cursor,
			});

			expect(result.meta.hasPreviousPage).toBe(true);
		});

		it("applies default limit of 50 when none provided", async () => {
			mockCollection.find.mockReturnValue(createCursor([]));
			mockCollection.countDocuments.mockResolvedValue(0);

			const result = await getMongoTableData({ tableName: "users", db: "testdb" });

			expect(result.meta.limit).toBe(50);
		});

		it("normalizes Date values to ISO strings", async () => {
			const date = new Date("2024-01-15T10:00:00.000Z");
			mockCollection.find.mockReturnValue(createCursor([{ _id: "id1", createdAt: date }]));
			mockCollection.countDocuments.mockResolvedValue(1);

			const result = await getMongoTableData({ tableName: "events", db: "testdb" });

			const row = result.data[0] as Record<string, unknown>;
			expect(row.createdAt).toBe("2024-01-15T10:00:00.000Z");
		});

		it("applies filter conditions", async () => {
			mockCollection.find.mockReturnValue(createCursor([]));
			mockCollection.countDocuments.mockResolvedValue(0);

			await getMongoTableData({
				tableName: "users",
				db: "testdb",
				filters: [{ columnName: "age", operator: ">", value: "25" }],
			});

			expect(mockCollection.find).toHaveBeenCalledWith(
				expect.objectContaining({ $and: expect.any(Array) }),
			);
		});

		it("applies sort parameter", async () => {
			const cursor = createCursor([]);
			mockCollection.find.mockReturnValue(cursor);
			mockCollection.countDocuments.mockResolvedValue(0);

			await getMongoTableData({
				tableName: "users",
				db: "testdb",
				sort: "name",
				order: "asc",
			});

			expect(cursor.sort).toHaveBeenCalledWith({ name: 1 });
		});

		it("applies descending sort", async () => {
			const cursor = createCursor([]);
			mockCollection.find.mockReturnValue(cursor);
			mockCollection.countDocuments.mockResolvedValue(0);

			await getMongoTableData({
				tableName: "users",
				db: "testdb",
				sort: "createdAt",
				order: "desc",
			});

			expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1 });
		});
	});

	// ============================================
	// createMongoCollection
	// ============================================
	describe("createMongoCollection", () => {
		it("creates an empty collection without validator", async () => {
			mockListCollectionsCursor.toArray.mockResolvedValue([]);
			mockDb.createCollection.mockResolvedValue(undefined);

			await createMongoCollection({ tableName: "events", db: "testdb" });

			expect(mockDb.createCollection).toHaveBeenCalledWith("events");
		});

		it("creates a collection with JSON Schema validator when fields provided", async () => {
			mockListCollectionsCursor.toArray.mockResolvedValue([]);
			mockDb.createCollection.mockResolvedValue(undefined);

			await createMongoCollection({
				tableName: "products",
				tableData: {
					tableName: "products",
					fields: [
						{ columnName: "name", columnType: "string", isNullable: false, isArray: false },
						{ columnName: "price", columnType: "double", isNullable: true, isArray: false },
					],
				},
				db: "testdb",
			});

			expect(mockDb.createCollection).toHaveBeenCalledWith(
				"products",
				expect.objectContaining({
					validator: expect.objectContaining({ $jsonSchema: expect.any(Object) }),
				}),
			);
		});

		it("throws HTTPException 400 when collection already exists", async () => {
			mockListCollectionsCursor.toArray.mockResolvedValue([{ name: "users" }]);

			await expect(
				createMongoCollection({ tableName: "users", db: "testdb" }),
			).rejects.toMatchObject({ status: 400 });
		});

		it("throws HTTPException 400 for unsupported BSON type", async () => {
			mockListCollectionsCursor.toArray.mockResolvedValue([]);

			await expect(
				createMongoCollection({
					tableName: "bad",
					tableData: {
						tableName: "bad",
						fields: [
							{
								columnName: "field",
								columnType: "unsupportedType",
								isNullable: false,
								isArray: false,
							},
						],
					},
					db: "testdb",
				}),
			).rejects.toMatchObject({ status: 400 });
		});

		it("creates array field with items schema", async () => {
			mockListCollectionsCursor.toArray.mockResolvedValue([]);
			mockDb.createCollection.mockResolvedValue(undefined);

			await createMongoCollection({
				tableName: "records",
				tableData: {
					tableName: "records",
					fields: [
						{ columnName: "tags", columnType: "string", isNullable: false, isArray: true },
					],
				},
				db: "testdb",
			});

			const call = mockDb.createCollection.mock.calls[0];
			const validator = (call[1] as { validator: { $jsonSchema: { properties: Record<string, unknown> } } }).validator;
			expect(validator.$jsonSchema.properties.tags).toMatchObject({
				bsonType: "array",
				items: { bsonType: "string" },
			});
		});
	});

	// ============================================
	// deleteMongoColumn
	// ============================================
	describe("deleteMongoColumn", () => {
		it("unsets field from all documents and returns deletedCount", async () => {
			mockCollection.updateMany.mockResolvedValue({ modifiedCount: 42 });

			const result = await deleteMongoColumn({
				tableName: "users",
				columnName: "age",
				db: "testdb",
			});

			expect(result).toEqual({ deletedCount: 42 });
			expect(mockCollection.updateMany).toHaveBeenCalledWith(
				{},
				{ $unset: { age: "" } },
			);
		});

		it("returns 0 deletedCount when no documents have the field", async () => {
			mockCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });

			const result = await deleteMongoColumn({
				tableName: "users",
				columnName: "nonexistent",
				db: "testdb",
			});

			expect(result.deletedCount).toBe(0);
		});
	});

	// ============================================
	// exportMongoTableData
	// ============================================
	describe("exportMongoTableData", () => {
		it("exports all documents with normalized values", async () => {
			const docs = [
				{ _id: "id1", name: "Alice", age: 30 },
				{ _id: "id2", name: "Bob", age: 25 },
			];
			mockCollection.find.mockReturnValue(createCursor(docs));

			const result = await exportMongoTableData({ tableName: "users", db: "testdb" });

			expect(result.rows).toHaveLength(2);
			expect(result.cols).toContain("_id");
			expect(result.cols).toContain("name");
			expect(result.cols).toContain("age");
		});

		it("converts Date values to ISO strings in export", async () => {
			const date = new Date("2024-06-01T00:00:00.000Z");
			mockCollection.find.mockReturnValue(createCursor([{ _id: "id1", createdAt: date }]));

			const result = await exportMongoTableData({ tableName: "events", db: "testdb" });

			const row = result.rows[0] as Record<string, unknown>;
			expect(row.createdAt).toBe("2024-06-01T00:00:00.000Z");
		});

		it("returns empty cols and rows for empty collection", async () => {
			mockCollection.find.mockReturnValue(createCursor([]));

			const result = await exportMongoTableData({ tableName: "empty", db: "testdb" });

			expect(result.cols).toEqual([]);
			expect(result.rows).toEqual([]);
		});

		it("deduplicates column names across documents with sparse fields", async () => {
			const docs = [
				{ _id: "id1", a: 1 },
				{ _id: "id2", b: 2 },
				{ _id: "id3", a: 3, b: 4 },
			];
			mockCollection.find.mockReturnValue(createCursor(docs));

			const result = await exportMongoTableData({ tableName: "sparse", db: "testdb" });

			const uniqueCols = new Set(result.cols);
			expect(uniqueCols.size).toBe(result.cols.length);
			expect(result.cols).toContain("a");
			expect(result.cols).toContain("b");
		});
	});

	// ============================================
	// buildMongoFilters (via getMongoTableData)
	// ============================================
	describe("filter operator handling", () => {
		const runFilter = async (operator: string, value: string) => {
			const cursor = createCursor([]);
			mockCollection.find.mockReturnValue(cursor);
			mockCollection.countDocuments.mockResolvedValue(0);

			await getMongoTableData({
				tableName: "users",
				db: "testdb",
				filters: [{ columnName: "age", operator, value }],
			});

			return mockCollection.find.mock.calls[0][0] as Record<string, unknown>;
		};

		it("handles = operator", async () => {
			const filter = await runFilter("=", "30");
			expect(filter).toMatchObject({ $and: [{ age: 30 }] });
		});

		it("handles != operator", async () => {
			const filter = await runFilter("!=", "30");
			expect(filter).toMatchObject({ $and: [{ age: { $ne: 30 } }] });
		});

		it("handles > operator", async () => {
			const filter = await runFilter(">", "25");
			expect(filter).toMatchObject({ $and: [{ age: { $gt: 25 } }] });
		});

		it("handles >= operator", async () => {
			const filter = await runFilter(">=", "25");
			expect(filter).toMatchObject({ $and: [{ age: { $gte: 25 } }] });
		});

		it("handles < operator", async () => {
			const filter = await runFilter("<", "25");
			expect(filter).toMatchObject({ $and: [{ age: { $lt: 25 } }] });
		});

		it("handles <= operator", async () => {
			const filter = await runFilter("<=", "25");
			expect(filter).toMatchObject({ $and: [{ age: { $lte: 25 } }] });
		});

		it("handles like operator with regex", async () => {
			const filter = await runFilter("like", "alice");
			expect(filter).toMatchObject({
				$and: [{ age: { $regex: "alice", $options: "" } }],
			});
		});

		it("handles ilike operator with case-insensitive regex", async () => {
			const filter = await runFilter("ilike", "alice");
			expect(filter).toMatchObject({
				$and: [{ age: { $regex: "alice", $options: "i" } }],
			});
		});

		it("parses null string value to null", async () => {
			const filter = await runFilter("=", "null");
			expect(filter).toMatchObject({ $and: [{ age: null }] });
		});

		it("parses boolean true string value", async () => {
			const filter = await runFilter("=", "true");
			expect(filter).toMatchObject({ $and: [{ age: true }] });
		});

		it("returns empty filter when no filters provided", async () => {
			const cursor = createCursor([]);
			mockCollection.find.mockReturnValue(cursor);
			mockCollection.countDocuments.mockResolvedValue(0);

			await getMongoTableData({ tableName: "users", db: "testdb", filters: [] });

			// buildMongoFilters([]) returns {} — no second argument
			expect(mockCollection.find).toHaveBeenCalledWith({});
		});
	});
});
