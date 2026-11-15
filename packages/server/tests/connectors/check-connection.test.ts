import { describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());

vi.mock("@/drivers.js", () => ({
	loadDriver: async () => ({
		Pool: class {
			query = query;
			on() {}
		},
	}),
}));

import { parseConnectionUrl } from "@/connection-url.js";
import { CONNECTORS, checkConnection, STARTUP_TIMEOUT_MS } from "@/connectors/index.js";

describe("database startup check", () => {
	it("bounds the PostgreSQL startup query", async () => {
		vi.useFakeTimers();
		query.mockReturnValue(new Promise(() => undefined));

		const connector = CONNECTORS.pg(
			parseConnectionUrl("postgresql://u@db.internal/app"),
			false,
		);

		try {
			const result = expect(checkConnection(connector)).rejects.toThrow(
				"Database startup check timed out",
			);

			await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS);
			await result;
		} finally {
			vi.useRealTimers();
		}

		expect(query).toHaveBeenCalledWith("SELECT 1");
	});
});
