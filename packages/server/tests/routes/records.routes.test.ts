import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openSqliteApp } from "../sqlite-app.js";

// Failure modes: a request the schema should refuse reaches the database and writes to it
// (a record added without its database, an empty update or delete list accepted).
describe("Records Routes", () => {
	let sqlite: Awaited<ReturnType<typeof openSqliteApp>>;

	const seeded = [
		{ id: 1, name: "Linus" },
		{ id: 2, name: "Ada" },
	];

	beforeAll(async () => {
		sqlite = await openSqliteApp();
	});

	afterAll(() => sqlite.close());

	it("refuses a POST without the database query param", async () => {
		const res = await sqlite.request("/sqlite/records", {
			method: "POST",
			body: { tableName: "users", data: { id: 3, name: "Grace" } },
		});

		expect(res.status).toBe(400);
		expect(await sqlite.users()).toEqual(seeded);
	});

	it("refuses a PATCH with an empty updates array", async () => {
		const res = await sqlite.request("/sqlite/records?db=main", {
			method: "PATCH",
			body: { tableName: "users", primaryKey: "id", updates: [] },
		});

		expect(res.status).toBe(400);
	});

	it("refuses a DELETE with an empty primaryKeys array", async () => {
		const res = await sqlite.request("/sqlite/records?db=main", {
			method: "DELETE",
			body: { tableName: "users", primaryKeys: [] },
		});

		expect(res.status).toBe(400);
		expect(await sqlite.users()).toEqual(seeded);
	});

	it("adds a record the schema accepts", async () => {
		const res = await sqlite.request("/sqlite/records?db=main", {
			method: "POST",
			body: { tableName: "users", data: { id: 3, name: "Grace" } },
		});

		expect(res.status).toBe(200);
		expect(await sqlite.users()).toEqual([...seeded, { id: 3, name: "Grace" }]);
	});
});
