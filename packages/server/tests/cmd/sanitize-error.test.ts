import { describe, expect, it } from "vitest";

import { sanitizeErrorMessage } from "@/cmd/sanitize-error.js";

// Failure modes for the scheme alternation built from the engine registry:
// - an alias scheme (cockroachdb, mariadb, tidb) is missing, so its credentials print verbatim
// - the `+` in `mongodb+srv` is left unescaped and turns into a quantifier, so SRV URIs leak
// - the TLS variant `rediss` is dropped while `redis` is kept
// - a non-database scheme such as https:// is redacted, mangling ordinary error text
// - the libsql scheme is missing, so a Turso URL prints its authToken verbatim
// - the libsql client rewrites libsql:// to https://, so an authToken in a kept https URL leaks

describe("sanitizeErrorMessage", () => {
	it("redacts a bare connection URL", () => {
		expect(
			sanitizeErrorMessage("connect ECONNREFUSED postgresql://admin:secret@localhost:5432/app"),
		).toBe("connect ECONNREFUSED the configured database");
	});

	it("redacts MariaDB, TiDB and CockroachDB connection URLs", () => {
		expect(
			sanitizeErrorMessage(
				"failed: mariadb://root:secret@h:3307/a, tidb://root:secret@h/b, cockroachdb://root:secret@h/c",
			),
		).toBe(
			"failed: the configured database, the configured database, the configured database",
		);
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

	it.each([
		"mongodb+srv://user:secret@cluster0.example.net/app",
		"rediss://default:secret@cache.example.com:6380",
		"cockroachdb://root:secret@crdb:26257/defaultdb",
		"mariadb://root:secret@maria:3306/app",
		"tidb://root:secret@tidb:4000/app",
		"libsql://my-db-org.turso.io?authToken=eyJhbGciOiJFZERTQSJ9.secret",
	])("redacts %s", (url) => {
		expect(sanitizeErrorMessage(`connect failed: ${url}`)).toBe(
			"connect failed: the configured database",
		);
	});

	it("redacts an authToken carried by a non-database URL", () => {
		expect(
			sanitizeErrorMessage(
				"fetch https://my-db-org.turso.io/v2/pipeline?tls=1&authToken=eyJhbGci.secret&x=1 failed",
			),
		).toBe("fetch https://my-db-org.turso.io/v2/pipeline?tls=1&authToken=[redacted]&x=1 failed");
	});

	it("keeps non-database URLs", () => {
		expect(sanitizeErrorMessage("see https://dbstudio.sh/docs")).toBe(
			"see https://dbstudio.sh/docs",
		);
	});

	it("leaves text without a URL untouched", () => {
		expect(sanitizeErrorMessage("Database startup check timed out")).toBe(
			"Database startup check timed out",
		);
	});
});
