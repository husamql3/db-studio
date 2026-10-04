import { describe, expect, it } from "vitest";
import { parseEnvCandidates } from "./env-import";

describe("parseEnvCandidates", () => {
	it("returns only database URLs, unquoted, ignoring comments and other vars", () => {
		const text = [
			"# database",
			'DATABASE_URL="postgres://u:p@localhost:5432/app"',
			"export REDIS_URL='redis://localhost:6379'",
			"API_URL=https://api.example.com",
			"MYSQL=mysql://root@127.0.0.1/shop # local",
			"PORT=3333",
			"BROKEN=postgres://",
			"",
		].join("\n");

		expect(parseEnvCandidates(text)).toEqual([
			{ name: "DATABASE_URL", url: "postgres://u:p@localhost:5432/app" },
			{ name: "REDIS_URL", url: "redis://localhost:6379" },
			{ name: "MYSQL", url: "mysql://root@127.0.0.1/shop" },
		]);
	});

	it("handles CRLF files", () => {
		expect(parseEnvCandidates("A=1\r\nDB=sqlite://./x.db\r\n")).toEqual([
			{ name: "DB", url: "sqlite://./x.db" },
		]);
	});
});
