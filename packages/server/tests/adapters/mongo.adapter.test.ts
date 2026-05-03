import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMongoClient = vi.hoisted(() => vi.fn());
const mockGetMongoDb = vi.hoisted(() => vi.fn());
const mockGetMongoDbName = vi.hoisted(() => vi.fn(() => "appdb"));

vi.mock("@/adapters/connections.js", () => ({
	getMongoClient: mockGetMongoClient,
	getMongoDb: mockGetMongoDb,
	getMongoDbName: mockGetMongoDbName,
}));

vi.mock("@/db-manager.js", () => ({
	isValidObjectId: vi.fn(() => false),
	coerceObjectId: vi.fn((value: unknown) => value),
}));

import { MongoAdapter } from "@/adapters/mongo/mongo.adapter.js";

const docs = [
	{ _id: "1", name: "Ada", age: 36 },
	{ _id: "2", name: "Linus", age: 55 },
];

function cursor(data = docs) {
	const chain = {
		sort: vi.fn(),
		skip: vi.fn(),
		limit: vi.fn(),
		toArray: vi.fn(async () => data),
	};
	chain.sort.mockReturnValue(chain);
	chain.skip.mockReturnValue(chain);
	chain.limit.mockReturnValue(chain);
	return chain;
}

function createMongoMocks() {
	const collection = {
		countDocuments: vi.fn(async () => docs.length),
		estimatedDocumentCount: vi.fn(async () => docs.length),
		find: vi.fn(() => cursor()),
		aggregate: vi.fn(() => cursor([{ total: docs.length }])),
		findOne: vi.fn(async (filter: Record<string, unknown>) => {
			if ("name" in filter) return { name: "Ada" };
			return null;
		}),
		updateMany: vi.fn(async () => ({ matchedCount: 2, modifiedCount: 2 })),
		updateOne: vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 })),
		insertOne: vi.fn(async () => ({ insertedId: "inserted" })),
		insertMany: vi.fn(async (records: unknown[]) => ({ insertedCount: records.length })),
		deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
		deleteMany: vi.fn(async () => ({ deletedCount: 1 })),
		drop: vi.fn(async () => true),
	};

	const mongoDb = {
		collection: vi.fn(() => collection),
		createCollection: vi.fn(async () => ({})),
		command: vi.fn(async () => ({ ok: 1 })),
		listCollections: vi.fn((filter?: { name?: string }) => ({
			toArray: vi.fn(async () => {
				if (filter?.name === "new_users" || filter?.name === "empty" || filter?.name === "other") return [];
				return [{ name: filter?.name ?? "users", options: { validator: { $jsonSchema: {} } } }];
			}),
		})),
	};

	const admin = {
		listDatabases: vi.fn(async () => ({
			databases: [{ name: "appdb", sizeOnDisk: 1024 }],
		})),
		serverStatus: vi.fn(async () => ({
			version: "7.0.0",
			connections: { current: 3, available: 97 },
		})),
	};
	const client = {
		db: vi.fn(() => ({
			admin: vi.fn(() => admin),
		})),
	};

	return { collection, mongoDb, admin, client };
}

describe("MongoAdapter integration scaffold", () => {
	let adapter: MongoAdapter;
	let mocks: ReturnType<typeof createMongoMocks>;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new MongoAdapter();
		mocks = createMongoMocks();
		mockGetMongoDb.mockResolvedValue(mocks.mongoDb);
		mockGetMongoClient.mockResolvedValue(mocks.client);
		mockGetMongoDbName.mockReturnValue("appdb");
	});

	it("executes every IDbAdapter method on the MongoDB client happy path", async () => {
		expect(await adapter.getDatabasesList()).toEqual([
			{ name: "appdb", size: "1.0 KB", owner: "n/a", encoding: "n/a" },
		]);
		expect(await adapter.getCurrentDatabase()).toEqual({ db: "appdb" });
		expect(await adapter.getDatabaseConnectionInfo()).toMatchObject({
			database: "appdb",
			version: "7.0.0",
			active_connections: 3,
			max_connections: 100,
		});
		expect(await adapter.getTablesList("appdb")).toEqual([
			{ tableName: "users", rowCount: 2 },
		]);

		await adapter.createTable({
			db: "appdb",
			tableData: {
				tableName: "new_users",
				fields: [{ columnName: "name", columnType: "string", isNullable: false }],
			} as never,
		});
		expect(await adapter.deleteTable({ db: "appdb", tableName: "users", cascade: true })).toEqual(
			{ deletedCount: 2, fkViolation: false, relatedRecords: [] },
		);
		expect(await adapter.getTableSchema({ db: "appdb", tableName: "users" })).toContain(
			'"collection": "users"',
		);
		expect(await adapter.getTableColumns({ db: "appdb", tableName: "users" })).toEqual(
			expect.arrayContaining([expect.objectContaining({ columnName: "_id" })]),
		);

		await adapter.addColumn({
			db: "appdb",
			tableName: "users",
			columnName: "age",
			columnType: "int",
			isNullable: true,
		} as never);
		expect(
			await adapter.deleteColumn({ db: "appdb", tableName: "users", columnName: "age" }),
		).toEqual({ deletedCount: 2 });
		await adapter.alterColumn({
			db: "appdb",
			tableName: "users",
			columnName: "age",
			columnType: "int",
			isNullable: false,
		} as never);
		await adapter.renameColumn({
			db: "appdb",
			tableName: "users",
			columnName: "name",
			newColumnName: "fullName",
		});

		expect(
			await adapter.getTableData({ db: "appdb", tableName: "users", limit: 2, sort: "name" }),
		).toMatchObject({ meta: { total: 2 }, data: docs });
		expect(
			await adapter.exportTableData({ db: "appdb", tableName: "users" }),
		).toMatchObject({ cols: ["_id", "name", "age"], rows: docs });
		expect(
			await adapter.addRecord({
				db: "appdb",
				params: { tableName: "users", data: { name: "Ada" } },
			} as never),
		).toEqual({ insertedCount: 1 });
		expect(
			await adapter.updateRecords({
				db: "appdb",
				params: {
					tableName: "users",
					primaryKey: "_id",
					updates: [{ columnName: "name", value: "Grace", rowData: { _id: "1" } }],
				},
			} as never),
		).toEqual({ updatedCount: 1 });
		expect(
			await adapter.deleteRecords({
				db: "appdb",
				tableName: "users",
				primaryKeys: [{ columnName: "_id", value: "1" }],
			}),
		).toEqual({ deletedCount: 1 });
		expect(
			await adapter.forceDeleteRecords({
				db: "appdb",
				tableName: "users",
				primaryKeys: [{ columnName: "_id", value: "1" }],
			}),
		).toEqual({ deletedCount: 1 });
		expect(
			await adapter.bulkInsertRecords({
				db: "appdb",
				tableName: "users",
				records: [{ name: "Ada" }, { name: "Linus" }],
			}),
		).toMatchObject({ success: true, successCount: 2, failureCount: 0 });
		expect(
			await adapter.executeQuery({
				db: "appdb",
				query: JSON.stringify({ collection: "users", operation: "find", filter: {} }),
			}),
		).toMatchObject({ columns: ["_id", "name", "age"], rowCount: 2 });
		expect(adapter.mapToUniversalType("double")).toBe("number");
		expect(adapter.mapFromUniversalType("json")).toBe("object");
		expect(mocks.mongoDb.collection).toHaveBeenCalledWith("users");
	});

	it("covers MongoDB pagination, query operations, and validation branches", async () => {
		expect(
			await adapter.getTableData({
				db: "appdb",
				tableName: "users",
				limit: 1,
			}),
		).toMatchObject({
			meta: {
				limit: 1,
				total: 2,
				hasNextPage: true,
				hasPreviousPage: false,
			},
		});
		expect(
			await adapter.getTableData({
				db: "appdb",
				tableName: "users",
				cursor: Buffer.from(JSON.stringify({ offset: 2 })).toString("base64url"),
				limit: 1,
				direction: "desc",
				sort: [{ columnName: "name", direction: "desc" }],
			}),
		).toMatchObject({
			meta: {
				limit: 1,
				total: 2,
				hasNextPage: false,
				hasPreviousPage: true,
			},
		});

		for (const operation of [
			{ operation: "aggregate", pipeline: [{ $match: {} }] },
			{ operation: "insertOne", document: { name: "Ada" } },
			{ operation: "insertMany", document: [{ name: "Ada" }, { name: "Linus" }] },
			{ operation: "updateOne", filter: { name: "Ada" }, update: { $set: { age: 37 } } },
			{ operation: "updateMany", filter: {}, update: { $set: { active: true } } },
			{ operation: "deleteOne", filter: { name: "Ada" } },
			{ operation: "deleteMany", filter: {} },
			{ operation: "count", filter: {} },
		]) {
			await expect(
				adapter.executeQuery({
					db: "appdb",
					query: JSON.stringify({ collection: "users", ...operation }),
				}),
			).resolves.toHaveProperty("rowCount");
		}

		await expect(adapter.createTable({ db: "appdb", tableData: { tableName: "empty", fields: [] } })).resolves.toBeUndefined();
		await expect(
			adapter.createTable({
				db: "appdb",
				tableData: {
					tableName: "other",
					fields: [{ columnName: "bad", columnType: "unsupported" }],
				} as never,
			}),
		).rejects.toMatchObject({ status: 400 });
		await expect(adapter.alterColumn({ db: "appdb", tableName: "users", columnName: "_id", columnType: "string" } as never)).rejects.toMatchObject({ status: 400 });
		await expect(
			adapter.renameColumn({
				db: "appdb",
				tableName: "users",
				columnName: "_id",
				newColumnName: "id",
			}),
		).rejects.toMatchObject({ status: 400 });
		await expect(adapter.bulkInsertRecords({ db: "appdb", tableName: "users", records: [] })).rejects.toMatchObject({ status: 400 });
		mocks.admin.listDatabases.mockResolvedValueOnce({ databases: [] });
		await expect(adapter.getDatabasesList()).rejects.toMatchObject({ status: 500 });
		mocks.admin.serverStatus.mockRejectedValueOnce(new Error("Unauthorized"));
		await expect(adapter.getDatabaseConnectionInfo()).resolves.toMatchObject({
			version: "unknown",
			active_connections: 0,
		});
		await expect(
			adapter.getTableSchema({ db: "appdb", tableName: "other" }),
		).rejects.toMatchObject({ status: 404 });
		await expect(
			adapter.addColumn({
				db: "appdb",
				tableName: "users",
				columnName: "name",
				columnType: "string",
			} as never),
		).rejects.toMatchObject({ status: 409 });
		await expect(
			adapter.renameColumn({
				db: "appdb",
				tableName: "users",
				columnName: "age",
				newColumnName: "years",
			}),
		).rejects.toMatchObject({ status: 404 });
		mocks.collection.insertOne.mockResolvedValueOnce({ insertedId: null });
		await expect(
			adapter.addRecord({
				db: "appdb",
				params: { tableName: "users", data: { name: "Ada" } },
			} as never),
		).rejects.toMatchObject({ status: 500 });
		await expect(
			adapter.updateRecords({
				db: "appdb",
				params: {
					tableName: "users",
					primaryKey: "_id",
					updates: [{ columnName: "name", value: "Ada", rowData: {} }],
				},
			} as never),
		).rejects.toMatchObject({ status: 400 });
		mocks.collection.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
		await expect(
			adapter.updateRecords({
				db: "appdb",
				params: {
					tableName: "users",
					primaryKey: "_id",
					updates: [{ columnName: "name", value: "Ada", rowData: { _id: "missing" } }],
				},
			} as never),
		).rejects.toMatchObject({ status: 404 });

		for (const query of [
			"",
			"not json",
			JSON.stringify({ collection: "users" }),
			JSON.stringify({ collection: "users", operation: "insertOne" }),
			JSON.stringify({ collection: "users", operation: "insertMany", document: { name: "Ada" } }),
			JSON.stringify({ collection: "users", operation: "updateOne" }),
			JSON.stringify({ collection: "users", operation: "unknown" }),
		]) {
			await expect(adapter.executeQuery({ db: "appdb", query })).rejects.toMatchObject({
				status: 400,
			});
		}

		expect(adapter.mapToUniversalType("bool")).toBe("boolean");
		expect(adapter.mapToUniversalType("date")).toBe("date");
		expect(adapter.mapToUniversalType("array")).toBe("array");
		expect(adapter.mapToUniversalType("object")).toBe("json");
		expect(adapter.mapToUniversalType("unknown")).toBe("text");
		expect(adapter.mapFromUniversalType("number")).toBe("double");
		expect(adapter.mapFromUniversalType("boolean")).toBe("bool");
		expect(adapter.mapFromUniversalType("date")).toBe("date");
		expect(adapter.mapFromUniversalType("array")).toBe("array");
		expect(adapter.mapFromUniversalType("unknown")).toBe("string");
		expect((adapter as { quoteIdentifier: (name: string) => string }).quoteIdentifier("users")).toBe("users");
		expect(
			(adapter as { buildCursors: () => { nextCursor: null; prevCursor: null } }).buildCursors(),
		).toEqual({ nextCursor: null, prevCursor: null });
	});
});
