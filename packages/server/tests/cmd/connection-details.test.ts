import { describe, expect, it } from "vitest";
import { getDatabaseConnectionDetails } from "@/cmd/connection-details.js";

describe("database connection details", () => {
	it("reports a safe PostgreSQL destination without credentials", () => {
		expect(
			getDatabaseConnectionDetails("postgresql://admin:secret@database.internal/app"),
		).toEqual({
			type: "pg",
			name: "PostgreSQL",
			destination: "database.internal:5432",
		});
	});

	it.each([
		["pg", "cockroachdb://root@database.internal/app", "database.internal:26257"],
		["mysql", "mariadb://root@database.internal/app", "database.internal:3306"],
		["mysql", "tidb://root@database.internal/app", "database.internal:4000"],
	])("uses the %s alias default port for %s", (_type, url, destination) => {
		expect(getDatabaseConnectionDetails(url)?.destination).toBe(destination);
	});
});
