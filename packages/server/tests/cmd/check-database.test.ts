import { describe, expect, it, vi } from "vitest";

import type { DatabaseManager } from "@/db-manager.js";
import {
	checkDatabaseConnection,
	getDatabaseConnectionDetails,
} from "@/cmd/check-database.js";

describe("database startup check", () => {
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

	it("bounds the PostgreSQL startup query", async () => {
		vi.useFakeTimers();
		const query = vi.fn().mockReturnValue(new Promise(() => undefined));
		const manager = {
			getDbType: () => "pg",
			getPgPool: async () => ({ query }),
		} as unknown as DatabaseManager;

		try {
			const result = expect(checkDatabaseConnection(manager)).rejects.toThrow(
				"Database startup check timed out",
			);
			await vi.advanceTimersByTimeAsync(2_000);
			await result;
		} finally {
			vi.useRealTimers();
		}

		expect(query).toHaveBeenCalledWith("SELECT 1");
	});
});
