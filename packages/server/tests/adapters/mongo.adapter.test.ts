import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMongoClient = vi.hoisted(() => vi.fn());
const mockGetMongoDb = vi.hoisted(() => vi.fn());
const mockGetMongoDbName = vi.hoisted(() => vi.fn(() => "appdb"));

vi.mock("@/open-connections.js", () => ({
	connector: () => ({
		client: mockGetMongoClient,
		db: mockGetMongoDb,
		dbName: mockGetMongoDbName(),
	}),
}));

import { MongoAdapter } from "@/adapters/mongo/mongo.adapter.js";

const admin = { listDatabases: vi.fn() };

describe("MongoAdapter.getDatabasesList", () => {
	let adapter: MongoAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new MongoAdapter();
		mockGetMongoClient.mockResolvedValue({ db: () => ({ admin: () => admin }) });
	});

	describe("system database filtering", () => {
		const systemRows = [
			{ name: "admin", sizeOnDisk: 40960 },
			{ name: "config", sizeOnDisk: 1024 },
			{ name: "myapp", sizeOnDisk: 1258291 },
			{ name: "local", sizeOnDisk: 512 },
		];

		it("filters admin/config/local when current is a user db", async () => {
			mockGetMongoDbName.mockReturnValue("myapp");
			admin.listDatabases.mockResolvedValue({ databases: systemRows });
			const result = await adapter.getDatabasesList();
			expect(result.map((d) => d.name)).toEqual(["myapp"]);
		});

		it("keeps the current db when it is a system db", async () => {
			mockGetMongoDbName.mockReturnValue("admin");
			admin.listDatabases.mockResolvedValue({ databases: systemRows });
			const result = await adapter.getDatabasesList();
			expect(result.map((d) => d.name)).toEqual(["admin", "myapp"]);
		});

		// Regression: Mongo omits databases that hold no data, so an empty connected
		// database is absent from listDatabases. A blanket "fall back to everything"
		// rule surfaced exactly the admin/config/local entries #277 asked us to hide.
		it("shows the connected db and still hides system dbs when the connected db is empty", async () => {
			mockGetMongoDbName.mockReturnValue("testdb");
			admin.listDatabases.mockResolvedValue({
				databases: [
					{ name: "admin", sizeOnDisk: 40960 },
					{ name: "local", sizeOnDisk: 1024 },
				],
			});
			const result = await adapter.getDatabasesList();
			expect(result.map((d) => d.name)).toEqual(["testdb"]);
		});
	});
});

describe("MongoAdapter.updateRecords", () => {
	const updateOne = vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 }));

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetMongoDb.mockResolvedValue({ collection: () => ({ updateOne }) });
	});

	it("filters on every key column of a composite key", async () => {
		await expect(
			new MongoAdapter().updateRecords({
				db: "appdb",
				params: {
					tableName: "members",
					primaryKey: "tenant_id",
					primaryKeys: ["tenant_id", "user_id"],
					updates: [
						{
							columnName: "name",
							value: "Grace",
							rowData: { tenant_id: 7, user_id: 42, name: "Ada" },
						},
					],
				},
			}),
		).resolves.toEqual({ updatedCount: 1 });

		expect(updateOne).toHaveBeenCalledWith(
			{ tenant_id: 7, user_id: 42 },
			{ $set: { name: "Grace" } },
		);
	});

	it("rejects an attempt to update the immutable _id field", async () => {
		await expect(
			new MongoAdapter().updateRecords({
				db: "appdb",
				params: {
					tableName: "users",
					primaryKey: "_id",
					updates: [
						{
							columnName: "_id",
							value: "other",
							rowData: { _id: "507f1f77bcf86cd799439011" },
						},
					],
				},
			}),
		).rejects.toMatchObject({ status: 400 });
		expect(updateOne).not.toHaveBeenCalled();
	});
});
