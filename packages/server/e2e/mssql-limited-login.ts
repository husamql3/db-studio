import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sql from "mssql";

// Regression for discussion #63: a SQL Server login without server-level permissions saw
// "No databases returned from server", because sys.master_files hides every row from it. Its
// table list then failed with error 229 for one table it could see but not read, and
// connection info failed with error 300 (no VIEW SERVER STATE). The databases, tables and
// connection routes must answer 200, and reading the unreadable table must answer 403.
process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("mssql://")) {
	throw new Error("Set DATABASE_URL to a disposable SQL Server database (sa)");
}
// Saving the connection must not touch the user's ~/.dbstudio.
process.env.DB_STUDIO_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "dbstudio-e2e-"));
const url = new URL(databaseUrl);
const db = decodeURIComponent(url.pathname.slice(1));
// Logins are server-wide: a per-run name means cleanup never drops a login this run did not create.
const LOGIN = `dbstudio_e2e_limited_${randomUUID().slice(0, 8)}`;
const PASSWORD = "E2e!limited1";
const admin = await new sql.ConnectionPool({
	server: url.hostname,
	port: Number(url.port || 1433),
	user: decodeURIComponent(url.username),
	password: decodeURIComponent(url.password),
	database: db,
	options: { trustServerCertificate: true },
}).connect();
const evidence: Record<string, unknown> = {};

const cleanup = async () => {
	await admin.query`DROP TABLE IF EXISTS dbstudio_e2e_readable, dbstudio_e2e_private`;
	await admin.query(`IF USER_ID('${LOGIN}') IS NOT NULL DROP USER [${LOGIN}]`);
	await admin.query(`IF SUSER_ID('${LOGIN}') IS NOT NULL DROP LOGIN [${LOGIN}]`);
};

try {
	await cleanup();
	await admin.query(
		`CREATE LOGIN [${LOGIN}] WITH PASSWORD = '${PASSWORD}', CHECK_POLICY = OFF, DEFAULT_DATABASE = [${db}]`,
	);
	await admin.query(`CREATE USER [${LOGIN}] FOR LOGIN [${LOGIN}]`);
	await admin.query`CREATE TABLE dbstudio_e2e_readable (id INT PRIMARY KEY, name NVARCHAR(10))`;
	await admin.query`CREATE TABLE dbstudio_e2e_private (id INT PRIMARY KEY, name NVARCHAR(10))`;
	await admin.query`INSERT INTO dbstudio_e2e_readable VALUES (1, 'a'), (2, 'b')`;
	await admin.query`INSERT INTO dbstudio_e2e_private VALUES (1, 'a'), (2, 'b'), (3, 'c')`;
	await admin.query(`GRANT SELECT ON dbstudio_e2e_readable TO [${LOGIN}]`);
	// Visible in the catalog, but not readable.
	await admin.query(`GRANT VIEW DEFINITION ON dbstudio_e2e_private TO [${LOGIN}]`);

	const limitedUrl = new URL(databaseUrl);
	limitedUrl.username = LOGIN;
	limitedUrl.password = encodeURIComponent(PASSWORD);
	const { createServer } = await import("../src/utils/create-server.js");
	const { connect } = await import("../src/connection.js");
	const { closeAllDbPools } = await import("../src/db-manager.js");
	const { app } = createServer();
	await connect(limitedUrl.toString());

	const call = async (route: string) => {
		const response = await app.handle(
			new Request(new URL(`/api${route}`, "http://localhost")),
		);
		const { requestId: _requestId, ...json } = (await response.json()) as Record<
			string,
			unknown
		>;
		return { status: response.status, body: json };
	};

	const databases = await call("/databases");
	evidence.databases = {
		status: databases.status,
		// Other databases on the server differ between machines; keep only the one under test.
		connected: (
			databases.body.data as { databases?: { name: string }[] } | undefined
		)?.databases
			?.filter((d) => d.name === db)
			.map((d) => d.name),
	};
	const connection = await call("/databases/connection");
	evidence.connection = {
		status: connection.status,
		user: (connection.body.data as { user?: string } | undefined)?.user === LOGIN,
	};
	const tables = await call(`/mssql/tables?${new URLSearchParams({ db })}`);
	evidence.tables = {
		status: tables.status,
		body: (tables.body.data as { tableName: string }[] | undefined)?.filter((t) =>
			t.tableName.startsWith("dbstudio_e2e_"),
		),
	};
	evidence.readPrivate = await call(
		`/mssql/tables/dbstudio_e2e_private/data?${new URLSearchParams({ db, limit: "50" })}`,
	);
	await closeAllDbPools();

	assert.deepEqual(evidence.databases, { status: 200, connected: [db] });
	assert.deepEqual(evidence.connection, { status: 200, user: true });
	assert.deepEqual(evidence.tables, {
		status: 200,
		body: [
			{ tableName: "dbstudio_e2e_private", rowCount: 3, rowCountEstimated: true },
			{ tableName: "dbstudio_e2e_readable", rowCount: 2 },
		],
	});
	assert.equal((evidence.readPrivate as { status: number }).status, 403);
	console.log("PASS SQL Server limited login lists databases and tables");
} finally {
	try {
		await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
		await writeFile(
			new URL("./artifacts/mssql-limited-login.json", import.meta.url),
			`${JSON.stringify(evidence, null, 2)}\n`,
		);
	} finally {
		await cleanup().finally(() => admin.close());
	}
}
