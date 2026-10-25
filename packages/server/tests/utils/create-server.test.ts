import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockDao = vi.hoisted(() => ({
	getDatabasesList: vi.fn().mockResolvedValue([]),
	getCurrentDatabase: vi.fn().mockResolvedValue({ db: "test" }),
	getDatabaseConnectionInfo: vi.fn().mockResolvedValue({
		version: "PostgreSQL 15.2",
		database: "test",
		user: "postgres",
		host: "localhost",
		port: 5432,
		active_connections: 1,
		max_connections: 100,
	}),
	getTablesList: vi.fn(),
	createTable: vi.fn(),
	deleteTable: vi.fn(),
	getTableSchema: vi.fn(),
	getTableColumns: vi.fn(),
	addColumn: vi.fn(),
	deleteColumn: vi.fn(),
	alterColumn: vi.fn(),
	renameColumn: vi.fn(),
	getTableData: vi.fn(),
	addRecord: vi.fn(),
	updateRecords: vi.fn(),
	deleteRecords: vi.fn(),
	forceDeleteRecords: vi.fn(),
	bulkInsertRecords: vi.fn(),
	exportTableData: vi.fn(),
	executeQuery: vi.fn(),
}));

vi.mock("@/adapters/adapter.registry.js", () => ({
	getAdapter: vi.fn(() => mockDao),
	adapterRegistry: {
		register: vi.fn(),
		get: vi.fn(() => mockDao),
		has: vi.fn((type: string) => ["pg", "mysql", "mssql", "mongodb"].includes(type)),
		getSupportedTypes: vi.fn(() => ["pg", "mysql", "mssql", "mongodb"]),
	},
}));

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({
		query: vi.fn(),
	})),
	getDbType: vi.fn(() => "pg"),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
}));

import { createServer } from "@/utils/create-server.js";

describe("createServer", () => {
	let server: ReturnType<typeof createServer>;

	beforeEach(() => {
		vi.clearAllMocks();
		server = createServer();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Database type validation middleware", () => {
		it("should reject an unsupported database type with a 400 error payload", async () => {
			const res = await server.app.handle(new Request(new URL("/api/invalid/tables?db=x", "http://localhost")));
			const json = await res.json();

			expect(res.status).toBe(400);
			expect(json).toHaveProperty("error");
		});

		it("should not treat SPA client routes as a database type (db-studio#214)", async () => {
			// A browser refresh on a client route like /table/:name must NOT be
			// interpreted as a /:dbType API request. Pre-fix this returned 400
			// "Invalid database type: table"; now it falls through to the SPA.
			const res = await server.app.handle(new Request(new URL("/table/users", "http://localhost"), {
				headers: { Accept: "text/html" },
			}));
			expect(res.status).not.toBe(400);
			const body = await res.text();
			expect(body).not.toContain("Invalid database type");
		});
	});

	describe("CORS middleware", () => {
		it("should NOT emit a wildcard Access-Control-Allow-Origin for a same-origin/no-origin request", async () => {
			const res = await server.app.handle(new Request(new URL("/api/databases", "http://localhost")));

			// Same-origin default: no allowlist configured means no allow-origin
			// header is reflected. A cross-origin caller therefore gets no CORS
			// grant (prevents drive-by-localhost).
			expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
		});

		it("should NOT emit an Access-Control-Allow-Origin for a disallowed cross-origin request", async () => {
			const res = await server.app.handle(new Request(new URL("/api/databases", "http://localhost"), {
				headers: { Origin: "https://evil.example" },
			}));

			expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
		});

		it("should advertise allowed methods on a CORS preflight", async () => {
			const res = await server.app.handle(new Request(new URL("/api/databases", "http://localhost"), {
					method: "OPTIONS",
					headers: { Origin: "https://web.db-studio.localhost", "Access-Control-Request-Method": "PUT" },
				}));

			const methods = res.headers.get("Access-Control-Allow-Methods");
			expect(methods).toContain("GET");
			expect(methods).toContain("POST");
			expect(methods).toContain("PUT");
			expect(methods).toContain("PATCH");
			expect(methods).toContain("DELETE");
			expect(methods).toContain("OPTIONS");
		});

		it("should advertise allowed headers on a CORS preflight", async () => {
			const res = await server.app.handle(new Request(new URL("/api/chat", "http://localhost"), {
				method: "OPTIONS",
				headers: {
					Origin: "https://web.db-studio.localhost",
					"Access-Control-Request-Method": "POST",
					"Access-Control-Request-Headers": "content-type,x-run-id,x-byok-anthropic",
				},
			}));

			const headers = res.headers.get("Access-Control-Allow-Headers");
			expect(headers).toContain("Content-Type");
			expect(headers?.toLowerCase()).toContain("x-run-id");
			expect(headers?.toLowerCase()).toContain("x-byok-anthropic");
		});

		it("should allow localhost and *.localhost origins when NODE_ENV is development", async () => {
			const originalEnv = process.env.NODE_ENV;
			const originalOrigins = process.env.ALLOWED_ORIGINS;
			try {
				process.env.NODE_ENV = "development";
				delete process.env.ALLOWED_ORIGINS;
				const res1 = await server.app.handle(new Request(new URL("/api/databases", "http://localhost"), {
					headers: { Origin: "https://web.db-studio.localhost" },
				}));
				expect(res1.headers.get("Access-Control-Allow-Origin")).toBe(
					"https://web.db-studio.localhost",
				);

				const res2 = await server.app.handle(new Request(new URL("/api/databases", "http://localhost"), {
					headers: { Origin: "http://localhost:3000" },
				}));
				expect(res2.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");

				const res3 = await server.app.handle(new Request(new URL("/api/databases", "http://localhost"), {
					headers: { Origin: "http://127.0.0.1:5173" },
				}));
				expect(res3.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:5173");

				const resEvil = await server.app.handle(new Request(new URL("/api/databases", "http://localhost"), {
					headers: { Origin: "https://evil.example" },
				}));
				expect(resEvil.headers.get("Access-Control-Allow-Origin")).toBeNull();
			} finally {
				if (originalEnv === undefined) {
					delete process.env.NODE_ENV;
				} else {
					process.env.NODE_ENV = originalEnv;
				}
				if (originalOrigins === undefined) {
					delete process.env.ALLOWED_ORIGINS;
				} else {
					process.env.ALLOWED_ORIGINS = originalOrigins;
				}
			}
		});

		it("should allow origins configured in ALLOWED_ORIGINS", async () => {
			const originalOrigins = process.env.ALLOWED_ORIGINS;
			try {
				process.env.ALLOWED_ORIGINS = "https://custom.dbstudio.sh, https://admin.dbstudio.sh";
				const res = await server.app.handle(new Request(new URL("/api/databases", "http://localhost"), {
					headers: { Origin: "https://custom.dbstudio.sh" },
				}));
				expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
					"https://custom.dbstudio.sh",
				);
			} finally {
				if (originalOrigins === undefined) {
					delete process.env.ALLOWED_ORIGINS;
				} else {
					process.env.ALLOWED_ORIGINS = originalOrigins;
				}
			}
		});
	});
	describe("Host check middleware", () => {
		const saved = { HOST: process.env.HOST, ALLOWED_HOSTS: process.env.ALLOWED_HOSTS };

		beforeEach(() => {
			delete process.env.HOST;
			delete process.env.ALLOWED_HOSTS;
		});

		afterEach(() => {
			for (const [key, value] of Object.entries(saved)) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		});

		const statusFor = async (host: string) => {
			const res = await server.app.handle(
				new Request(new URL("/api/databases", `http://${host}`)),
			);
			return res.status;
		};

		it.each([
			"localhost",
			"localhost:3333",
			"127.0.0.1:3333",
			"[::1]:3333",
			"web.db-studio.localhost",
		])("should allow %s", async (host) => {
			expect(await statusFor(host)).not.toBe(403);
		});

		it.each(["evil.example", "localhost.evil.example", "127.0.0.1.evil.example"])(
			"should reject %s with a 403",
			async (host) => {
				expect(await statusFor(host)).toBe(403);
			},
		);

		it("should keep the check on when HOST is a non-loopback address", async () => {
			process.env.HOST = "0.0.0.0";
			expect(await statusFor("evil.example")).toBe(403);
			expect(await statusFor("127.0.0.1:3333")).not.toBe(403);
		});

		it("should allow only the hosts listed in ALLOWED_HOSTS", async () => {
			process.env.ALLOWED_HOSTS = "a.lan, 10.0.0.5 ,[fd00::1]";
			expect(await statusFor("a.lan:3333")).not.toBe(403);
			expect(await statusFor("10.0.0.5")).not.toBe(403);
			expect(await statusFor("[fd00::1]:3333")).not.toBe(403);
			expect(await statusFor("b.lan")).toBe(403);
		});

		it("should not treat * in ALLOWED_HOSTS as a wildcard", async () => {
			process.env.ALLOWED_HOSTS = "*";
			expect(await statusFor("evil.example")).toBe(403);
		});
	});

	describe("Basic auth (GHSA-q37f-25p8-xvjj)", () => {
		const saved = process.env.DB_STUDIO_PASSWORD;

		afterEach(() => {
			if (saved === undefined) delete process.env.DB_STUDIO_PASSWORD;
			else process.env.DB_STUDIO_PASSWORD = saved;
		});

		const statusWith = async (authorization?: string) => {
			const res = await server.app.handle(
				new Request(new URL("/api/databases", "http://localhost"), {
					headers: authorization ? { authorization } : {},
				}),
			);
			return res;
		};
		const basic = (user: string, password: string) =>
			`Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

		it("should ask for credentials when a password is set, even with Host: localhost", async () => {
			process.env.DB_STUDIO_PASSWORD = "s3cret:pass";
			const res = await statusWith();
			expect(res.status).toBe(401);
			expect(res.headers.get("www-authenticate")).toMatch(/^Basic /);
		});

		it.each([
			["a wrong password", basic("admin", "wrong")],
			["the password as the username", basic("s3cret:pass", "")],
			["a non-Basic scheme", "Bearer s3cret:pass"],
			["no colon", `Basic ${Buffer.from("s3cret:pass".replace(":", "")).toString("base64")}`],
		])("should refuse %s", async (_, authorization) => {
			process.env.DB_STUDIO_PASSWORD = "s3cret:pass";
			expect((await statusWith(authorization)).status).toBe(401);
		});

		it("should accept the password with any username, including one containing no colon", async () => {
			process.env.DB_STUDIO_PASSWORD = "s3cret:pass";
			expect((await statusWith(basic("anyone", "s3cret:pass"))).status).not.toBe(401);
			expect((await statusWith(basic("", "s3cret:pass"))).status).not.toBe(401);
		});

		it("should not ask for credentials without a password", async () => {
			delete process.env.DB_STUDIO_PASSWORD;
			expect((await statusWith()).status).not.toBe(401);
		});
	});

	describe("Cross-site request guard (GHSA-vw88-9x6f-fcp5)", () => {
		const statusFor = async (path: string, headers: Record<string, string>) =>
			(await server.app.handle(new Request(new URL(path, "http://localhost"), { headers })))
				.status;

		it.each(["cross-site", "same-site"])(
			"should refuse an API GET a page on another site sends (%s)",
			async (site) => {
				expect(
					await statusFor("/api/pg/tables/users/data?db=x", {
						"sec-fetch-site": site,
						origin: "https://evil.example",
					}),
				).toBe(403);
				expect(await statusFor("/api/databases", { "sec-fetch-site": site })).toBe(403);
				expect(mockDao.getTableData).not.toHaveBeenCalled();
			},
		);

		it.each(["same-origin", "none"])("should allow %s API requests", async (site) => {
			expect(await statusFor("/api/databases", { "sec-fetch-site": site })).not.toBe(403);
		});
	});
});
