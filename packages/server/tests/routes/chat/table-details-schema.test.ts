import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getTablesList: vi.fn(),
	getTableColumns: vi.fn(),
	getTableData: vi.fn(),
}));

vi.mock("@/adapters/adapter.registry.js", () => ({ ADAPTERS: { pg: mocks } }));

vi.mock("@/open-connections.js", () => ({
	requestConnection: vi.fn(() => ({ dbType: "pg" })),
}));

import { getDetailedSchema } from "@/routes/chat/table-details-schema.js";

describe("getDetailedSchema", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getTablesList.mockResolvedValue([
			{ schemaName: "analytics", tableName: "events", rowCount: 5 },
			{ schemaName: "public", tableName: "projects", rowCount: 2 },
		]);
		mocks.getTableColumns.mockImplementation(({ tableName }: { tableName: string }) => {
			if (tableName === "events") throw new Error('relation "events" does not exist');

			return Promise.resolve([
				{
					columnName: "id",
					dataType: "number",
					dataTypeLabel: "integer",
					isNullable: false,
					columnDefault: null,
					isPrimaryKey: true,
					isForeignKey: false,
					referencedTable: null,
					referencedColumn: null,
					enumValues: null,
				},
			]);
		});
		mocks.getTableData.mockResolvedValue({
			data: [],
			meta: {
				limit: 3,
				total: 0,
				hasNextPage: false,
				hasPreviousPage: false,
				nextCursor: null,
				prevCursor: null,
			},
		});
	});

	// A table outside the search path got its columns looked up without its schema.
	it("looks each table's columns up in that table's own schema", async () => {
		mocks.getTablesList.mockResolvedValue([
			{ schemaName: "public", tableName: "projects", rowCount: 2 },
		]);

		await getDetailedSchema("dbstudio");

		expect(mocks.getTableColumns).toHaveBeenCalledWith({
			tableName: "projects",
			schemaName: "public",
			db: "dbstudio",
		});
	});

	// The relationship was rebuilt by splitting "table.column" on its first dot.
	it("keeps a referenced table whose name contains a dot", async () => {
		mocks.getTablesList.mockResolvedValue([{ tableName: "orders", rowCount: 1 }]);
		mocks.getTableColumns.mockResolvedValue([
			{
				columnName: "customer_id",
				dataType: "number",
				dataTypeLabel: "integer",
				isNullable: false,
				columnDefault: null,
				isPrimaryKey: false,
				isForeignKey: true,
				referencedTable: "crm.customers",
				referencedColumn: "id",
				enumValues: null,
			},
		]);

		const { relationships } = await getDetailedSchema("dbstudio");

		expect(relationships).toEqual([
			{
				fromTable: "orders",
				fromColumn: "customer_id",
				toTable: "crm.customers",
				toColumn: "id",
			},
		]);
	});

	// The driver error reaches the error handler as is, so it keeps its status classification.
	it("fails with the driver's error when a table cannot be introspected", async () => {
		await expect(getDetailedSchema("dbstudio")).rejects.toThrow(
			'relation "events" does not exist',
		);
	});
});
