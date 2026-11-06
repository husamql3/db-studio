import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openSqliteApp } from "../sqlite-app.js";

describe("Tables Routes", () => {
	let sqlite: Awaited<ReturnType<typeof openSqliteApp>>;

	beforeAll(async () => {
		sqlite = await openSqliteApp();
	});

	afterAll(() => sqlite.close());

	const tableNames = async () => {
		const res = await sqlite.request("/sqlite/tables?db=main");

		return ((await res.json()).data as { tableName: string }[]).map((t) => t.tableName);
	};

	const names = async (query: string) => {
		const res = await sqlite.request(`/sqlite/tables/users/data?db=main&${query}`);
		expect(res.status).toBe(200);

		return ((await res.json()).data.data as { name: string }[]).map((row) => row.name);
	};

	describe("POST /:dbType/tables", () => {
		it("refuses a table without fields", async () => {
			const res = await sqlite.request("/sqlite/tables?db=main", {
				method: "POST",
				body: { tableName: "empty_fields_table", fields: [] },
			});

			expect(res.status).toBe(400);
			expect(await tableNames()).not.toContain("empty_fields_table");
		});

		it("refuses a foreign key with an invalid onDelete action", async () => {
			const res = await sqlite.request("/sqlite/tables?db=main", {
				method: "POST",
				body: {
					tableName: "bad_fk_table",
					fields: [
						{ columnName: "id", columnType: "INTEGER", isPrimaryKey: true },
						{ columnName: "ref_id", columnType: "INTEGER" },
					],
					foreignKeys: [
						{
							columnName: "ref_id",
							referencedTable: "users",
							referencedColumn: "id",
							onUpdate: "CASCADE",
							onDelete: "INVALID_ACTION",
						},
					],
				},
			});

			expect(res.status).toBe(400);
			expect(await tableNames()).not.toContain("bad_fk_table");
		});
	});

	describe("GET /:dbType/tables/:tableName/data", () => {
		it.each([
			[
				"a sort direction carrying SQL (GHSA-vw88-9x6f-fcp5)",
				`sort=${encodeURIComponent(JSON.stringify([{ columnName: "id", direction: "ASC, (SELECT 1)" }]))}`,
			],
			[
				"a filter that is not a filter object",
				`filters=${encodeURIComponent(JSON.stringify([{ columnName: "id", operator: "=" }]))}`,
			],
			["an invalid direction", "direction=invalid"],
			["an invalid order", "order=invalid"],
		])("refuses %s", async (_, query) => {
			const res = await sqlite.request(`/sqlite/tables/users/data?db=main&${query}`);

			expect(res.status).toBe(400);
		});

		it("reads filters that are not JSON as no filters", async () => {
			expect(await names("filters=invalid-json")).toEqual(["Linus", "Ada"]);
		});

		it("reads a sort that is not JSON as one column sorted ascending", async () => {
			expect(await names("sort=name")).toEqual(["Ada", "Linus"]);
		});
	});
});
