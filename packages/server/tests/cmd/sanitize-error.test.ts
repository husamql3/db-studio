import { describe, expect, it } from "vitest";

import { sanitizeErrorMessage } from "@/cmd/sanitize-error.js";

describe("sanitizeErrorMessage", () => {
	it("redacts a bare connection URL", () => {
		expect(
			sanitizeErrorMessage("connect ECONNREFUSED postgresql://admin:secret@localhost:5432/app"),
		).toBe("connect ECONNREFUSED the configured database");
	});

	it("keeps closing parens and commas of the supported-types message", () => {
		expect(
			sanitizeErrorMessage(
				"Unsupported database type: invalid. Supported types: PostgreSQL (postgres://), MySQL (mysql://), SQL Server (mssql://).",
			),
		).toBe(
			"Unsupported database type: invalid. Supported types: PostgreSQL (the configured database), MySQL (the configured database), SQL Server (the configured database).",
		);
	});

	it("redacts every host of a comma-separated replica set URI", () => {
		expect(
			sanitizeErrorMessage(
				"topology closed mongodb://user:secret@h1:27017,h2:27017,h3:27017/app?replicaSet=rs0",
			),
		).toBe("topology closed the configured database");
	});

	it("redacts credentials containing parens or commas", () => {
		expect(sanitizeErrorMessage("auth failed for postgresql://u:p)x,y@localhost:5432/db")).toBe(
			"auth failed for the configured database",
		);
	});

	it("leaves text without a URL untouched", () => {
		expect(sanitizeErrorMessage("Database startup check timed out")).toBe(
			"Database startup check timed out",
		);
	});
});
