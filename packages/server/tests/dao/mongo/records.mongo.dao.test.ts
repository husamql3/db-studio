import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

// Mutable collection mock
let mockCollection: ReturnType<typeof makeMockCollection>;

const makeMockCollection = () => ({
	insertOne: vi.fn(),
	updateOne: vi.fn(),
	deleteMany: vi.fn(),
	findOne: vi.fn(),
});

const mockDb = {
	collection: vi.fn(() => mockCollection),
};

vi.mock("@/db-manager.js", () => ({
	getMongoDb: vi.fn(() => Promise.resolve(mockDb)),
	isValidObjectId: vi.fn((v: unknown) => typeof v === "string" && /^[0-9a-f]{24}$/i.test(v)),
	coerceObjectId: vi.fn((v: unknown) => ({ _bsontype: "ObjectId", toHexString: () => v })),
}));

import {
	addMongoRecord,
	updateMongoRecords,
	deleteMongoRecords,
	forceDeleteMongoRecords,
} from "@/dao/mongo/records.dao.js";

describe("MongoDB Records DAO", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCollection = makeMockCollection();
		mockDb.collection.mockReturnValue(mockCollection);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ============================================
	// addMongoRecord
	// ============================================
	describe("addMongoRecord", () => {
		it("inserts a document and returns insertedCount 1", async () => {
			mockCollection.insertOne.mockResolvedValue({ insertedId: "newId" });

			const result = await addMongoRecord({
				db: "testdb",
				params: { tableName: "users", data: { name: "Alice", email: "alice@test.com" } },
			});

			expect(result).toEqual({ insertedCount: 1 });
			expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);
		});

		it("removes empty _id from payload before inserting", async () => {
			mockCollection.insertOne.mockResolvedValue({ insertedId: "autoId" });

			await addMongoRecord({
				db: "testdb",
				params: { tableName: "users", data: { _id: "", name: "Bob" } },
			});

			const insertedDoc = mockCollection.insertOne.mock.calls[0][0] as Record<string, unknown>;
			expect(insertedDoc).not.toHaveProperty("_id");
			expect(insertedDoc.name).toBe("Bob");
		});

		it("removes null _id from payload before inserting", async () => {
			mockCollection.insertOne.mockResolvedValue({ insertedId: "autoId" });

			await addMongoRecord({
				db: "testdb",
				params: { tableName: "users", data: { _id: null, name: "Carol" } },
			});

			const insertedDoc = mockCollection.insertOne.mock.calls[0][0] as Record<string, unknown>;
			expect(insertedDoc).not.toHaveProperty("_id");
		});

		it("preserves explicit non-empty _id", async () => {
			mockCollection.insertOne.mockResolvedValue({
				insertedId: "507f1f77bcf86cd799439011",
			});

			await addMongoRecord({
				db: "testdb",
				params: {
					tableName: "configs",
					data: { _id: "507f1f77bcf86cd799439011", key: "theme" },
				},
			});

			const insertedDoc = mockCollection.insertOne.mock.calls[0][0] as Record<string, unknown>;
			expect(insertedDoc._id).toBe("507f1f77bcf86cd799439011");
		});

		it("throws HTTPException 500 when insertOne returns no insertedId", async () => {
			mockCollection.insertOne.mockResolvedValue({ insertedId: null });

			await expect(
				addMongoRecord({
					db: "testdb",
					params: { tableName: "users", data: { name: "Dave" } },
				}),
			).rejects.toMatchObject({ status: 500 });
		});

		it("throws HTTPException 500 when insertOne returns undefined insertedId", async () => {
			mockCollection.insertOne.mockResolvedValue({});

			await expect(
				addMongoRecord({
					db: "testdb",
					params: { tableName: "users", data: { name: "Eve" } },
				}),
			).rejects.toMatchObject({ status: 500 });
		});

		it("inserts nested document structure", async () => {
			mockCollection.insertOne.mockResolvedValue({ insertedId: "newId" });

			await addMongoRecord({
				db: "testdb",
				params: {
					tableName: "orders",
					data: {
						userId: "u1",
						items: [{ productId: "p1", qty: 2 }],
						shipping: { city: "NYC", zip: "10001" },
					},
				},
			});

			expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);
		});
	});

	// ============================================
	// updateMongoRecords
	// ============================================
	describe("updateMongoRecords", () => {
		it("batches multiple column updates for the same document into one updateOne call", async () => {
			mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

			const result = await updateMongoRecords({
				db: "testdb",
				params: {
					tableName: "users",
					primaryKey: "_id",
					updates: [
						{
							rowData: { _id: "507f1f77bcf86cd799439011" },
							columnName: "name",
							value: "Updated Name",
						},
						{
							rowData: { _id: "507f1f77bcf86cd799439011" },
							columnName: "age",
							value: 32,
						},
					],
				},
			});

			expect(result).toEqual({ updatedCount: 1 });
			expect(mockCollection.updateOne).toHaveBeenCalledTimes(1);
			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				expect.anything(),
				{ $set: { name: "Updated Name", age: 32 } },
			);
		});

		it("makes separate updateOne calls for different documents", async () => {
			mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

			const result = await updateMongoRecords({
				db: "testdb",
				params: {
					tableName: "users",
					primaryKey: "_id",
					updates: [
						{
							rowData: { _id: "507f1f77bcf86cd799439011" },
							columnName: "name",
							value: "Alice",
						},
						{
							rowData: { _id: "507f1f77bcf86cd799439012" },
							columnName: "name",
							value: "Bob",
						},
					],
				},
			});

			expect(mockCollection.updateOne).toHaveBeenCalledTimes(2);
			expect(result.updatedCount).toBe(2);
		});

		it("coerces valid ObjectId strings for _id field", async () => {
			mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
			const { isValidObjectId } = await import("@/db-manager.js");
			vi.mocked(isValidObjectId).mockReturnValue(true);

			await updateMongoRecords({
				db: "testdb",
				params: {
					tableName: "users",
					primaryKey: "_id",
					updates: [
						{
							rowData: { _id: "507f1f77bcf86cd799439011" },
							columnName: "age",
							value: 30,
						},
					],
				},
			});

			const { coerceObjectId } = await import("@/db-manager.js");
			expect(coerceObjectId).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
		});

		it("uses custom primary key when provided", async () => {
			mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

			await updateMongoRecords({
				db: "testdb",
				params: {
					tableName: "products",
					primaryKey: "sku",
					updates: [
						{
							rowData: { sku: "WIDGET-001" },
							columnName: "price",
							value: 14.99,
						},
					],
				},
			});

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ sku: "WIDGET-001" },
				{ $set: { price: 14.99 } },
			);
		});

		it("throws 400 when primary key is missing in row data", async () => {
			await expect(
				updateMongoRecords({
					db: "testdb",
					params: {
						tableName: "users",
						primaryKey: "_id",
						updates: [{ rowData: {}, columnName: "name", value: "Ghost" }],
					},
				}),
			).rejects.toMatchObject({ status: 400 });
		});

		it("throws 404 when document is not found (matchedCount 0)", async () => {
			mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

			await expect(
				updateMongoRecords({
					db: "testdb",
					params: {
						tableName: "users",
						primaryKey: "_id",
						updates: [
							{
								rowData: { _id: "507f1f77bcf86cd799439099" },
								columnName: "name",
								value: "Ghost",
							},
						],
					},
				}),
			).rejects.toMatchObject({ status: 404 });
		});

		it("returns 0 updatedCount when all updates are no-ops (matched but not modified)", async () => {
			mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 0 });

			const result = await updateMongoRecords({
				db: "testdb",
				params: {
					tableName: "users",
					primaryKey: "_id",
					updates: [
						{
							rowData: { _id: "507f1f77bcf86cd799439011" },
							columnName: "name",
							value: "Same Name",
						},
					],
				},
			});

			expect(result.updatedCount).toBe(0);
		});
	});

	// ============================================
	// deleteMongoRecords
	// ============================================
	describe("deleteMongoRecords", () => {
		it("deletes documents by _id and returns deletedCount", async () => {
			mockCollection.deleteMany.mockResolvedValue({ deletedCount: 2 });

			const result = await deleteMongoRecords({
				tableName: "users",
				primaryKeys: [
					{ columnName: "_id", value: "507f1f77bcf86cd799439011" },
					{ columnName: "_id", value: "507f1f77bcf86cd799439012" },
				],
				db: "testdb",
			});

			expect(result.deletedCount).toBe(2);
			expect(mockCollection.deleteMany).toHaveBeenCalledWith({
				_id: { $in: expect.any(Array) },
			});
		});

		it("deletes documents by custom primary key", async () => {
			mockCollection.deleteMany.mockResolvedValue({ deletedCount: 1 });

			await deleteMongoRecords({
				tableName: "products",
				primaryKeys: [{ columnName: "sku", value: "WIDGET-001" }],
				db: "testdb",
			});

			expect(mockCollection.deleteMany).toHaveBeenCalledWith({
				sku: { $in: ["WIDGET-001"] },
			});
		});

		it("coerces valid ObjectId strings for _id primary key", async () => {
			mockCollection.deleteMany.mockResolvedValue({ deletedCount: 1 });
			const { isValidObjectId } = await import("@/db-manager.js");
			vi.mocked(isValidObjectId).mockReturnValue(true);

			await deleteMongoRecords({
				tableName: "users",
				primaryKeys: [{ columnName: "_id", value: "507f1f77bcf86cd799439011" }],
				db: "testdb",
			});

			const { coerceObjectId } = await import("@/db-manager.js");
			expect(coerceObjectId).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
		});

		it("returns 0 deletedCount when no documents matched", async () => {
			mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });

			const result = await deleteMongoRecords({
				tableName: "users",
				primaryKeys: [{ columnName: "_id", value: "nonexistent_id" }],
				db: "testdb",
			});

			expect(result.deletedCount).toBe(0);
		});

		it("handles deletion of many documents in a single call", async () => {
			mockCollection.deleteMany.mockResolvedValue({ deletedCount: 50 });

			const primaryKeys = Array.from({ length: 50 }, (_, i) => ({
				columnName: "_id",
				value: `id_${i}`,
			}));

			const result = await deleteMongoRecords({
				tableName: "users",
				primaryKeys,
				db: "testdb",
			});

			expect(result.deletedCount).toBe(50);
			expect(mockCollection.deleteMany).toHaveBeenCalledTimes(1);
		});
	});

	// ============================================
	// forceDeleteMongoRecords
	// ============================================
	describe("forceDeleteMongoRecords", () => {
		it("delegates to deleteMongoRecords and returns deletedCount", async () => {
			mockCollection.deleteMany.mockResolvedValue({ deletedCount: 3 });

			const result = await forceDeleteMongoRecords({
				tableName: "users",
				primaryKeys: [
					{ columnName: "_id", value: "id1" },
					{ columnName: "_id", value: "id2" },
					{ columnName: "_id", value: "id3" },
				],
				db: "testdb",
			});

			expect(result).toEqual({ deletedCount: 3 });
			expect(mockCollection.deleteMany).toHaveBeenCalledTimes(1);
		});

		it("returns 0 deletedCount for unmatched documents", async () => {
			mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });

			const result = await forceDeleteMongoRecords({
				tableName: "users",
				primaryKeys: [{ columnName: "_id", value: "ghost_id" }],
				db: "testdb",
			});

			expect(result.deletedCount).toBe(0);
		});
	});
});
