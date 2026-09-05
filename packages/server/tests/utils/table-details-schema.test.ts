import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getTablesList: vi.fn(),
	getTableColumns: vi.fn(),
	getTableData: vi.fn(),
}));

vi.mock("@/adapters/adapter.registry.js", () => ({
	getAdapter: vi.fn(() => mocks),
}));

vi.mock("@/db-manager.js", () => ({
	getDbType: vi.fn(() => "pg"),
}));

import { getDetailedSchema } from "@/utils/table-details-schema.js";

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

	it("keeps schema generation usable when one table cannot be introspected", async () => {
		const schema = await getDetailedSchema("dbstudio");

		expect(schema.tables).toEqual([
			{ name: "analytics.events", columns: [] },
			{
				name: "public.projects",
				columns: [{ name: "id", type: "integer", nullable: false, isPrimaryKey: true }],
			},
		]);
	});
});
