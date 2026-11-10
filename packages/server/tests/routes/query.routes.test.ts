import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openSqliteApp } from "../sqlite-app.js";

describe("POST /:dbType/query", () => {
	let sqlite: Awaited<ReturnType<typeof openSqliteApp>>;

	beforeAll(async () => {
		sqlite = await openSqliteApp();
	});

	afterAll(() => sqlite.close());

	it("refuses a query without the database query param, and does not run it", async () => {
		const res = await sqlite.request("/sqlite/query", {
			method: "POST",
			body: { query: "DELETE FROM users" },
		});

		expect(res.status).toBe(400);
		expect(await sqlite.users()).toHaveLength(2);
	});

	it("refuses a body without a query", async () => {
		const res = await sqlite.request("/sqlite/query?db=main", { method: "POST", body: {} });

		expect(res.status).toBe(400);
	});

	it("runs a query with both", async () => {
		const res = await sqlite.request("/sqlite/query?db=main", {
			method: "POST",
			body: { query: "SELECT name FROM users ORDER BY id" },
		});

		expect(res.status).toBe(200);
		expect((await res.json()).data.rows).toEqual([{ name: "Linus" }, { name: "Ada" }]);
	});
});
