// Failure modes: the account name in the home directory reaches Sentry when
// 0. an npx install under a POSIX home names it in every frame (DB-STUDIO-SERVER-C, -E);
// 1. a Windows ESM frame names the bundle as a file URL (`file:///C:/Users/<name>/…`),
//    whose forward slashes never match the backslashed `homedir()` (DB-STUDIO-SERVER-Y, -N);
// 2. the home directory holds a space, which the file URL percent-encodes (`<first>%20<last>`);
// 3. a CommonJS frame on Windows keeps the plain backslashed path;
// 4. file URLs encode #, ?, and Unicode in account names;
// 5. replacing a decoded home ending in % first leaves the encoded suffix (25) behind.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HTTPException } from "@/http-exception.js";
import {
	captureServerError,
	databaseTypeForRequest,
	operationForRequest,
} from "@/observability.js";

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), home: "/Users/jane" }));

vi.mock("node:os", async (importOriginal) => {
	const os = await importOriginal<typeof import("node:os")>();

	return { ...os, homedir: () => sentry.home };
});

vi.mock("@sentry/node", () => ({
	captureException: sentry.captureException,
	close: vi.fn(),
	getClient: vi.fn(),
	init: vi.fn(),
	isInitialized: vi.fn(() => false),
	startSpan: vi.fn(<T>(_options: never, callback: () => T) => callback()),
}));

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("NODE_ENV", "production");
	vi.stubEnv("DB_STUDIO_DATA_DIR", `/tmp/db-studio-observability-${process.pid}`);
});

afterEach(() => vi.unstubAllEnvs());

describe("observability privacy boundary", () => {
	it("classifies routes without retaining user-controlled path values", () => {
		expect(operationForRequest("GET", "/api/pg/tables/customer-secrets")).toBe("get_tables");
		expect(operationForRequest("POST", "/api/query/private-query-id")).toBe("post_query");
		expect(operationForRequest("GET", "/api/unknown/private-value")).toBe("get_other");
		expect(databaseTypeForRequest("/api/mysql/tables/customer-secrets")).toBe("mysql");
		expect(databaseTypeForRequest("/api/unknown/private-value")).toBeUndefined();
	});

	it("reports a server failure with safe diagnostic context and its stack", () => {
		const error = Object.assign(new Error("relation customer_secrets does not exist"), {
			name: "DatabaseError",
			code: "42P01",
		});

		captureServerError(new HTTPException(503, { message: error.message, cause: error }), {
			operation: "get_tables",
			status: 503,
			dbType: "pg",
		});

		expect(sentry.captureException).toHaveBeenCalledOnce();
		const [reportedError, context] = sentry.captureException.mock.calls[0];
		expect(reportedError).toBeInstanceOf(Error);
		expect(reportedError).toMatchObject({
			name: "DatabaseError",
			message: "get_tables failed with 503 42P01",
		});
		expect(reportedError.stack).toContain("observability.test.ts");
		expect(reportedError.stack).not.toContain("customer_secrets");
		expect(context).toMatchObject({
			tags: {
				operation: "get_tables",
				status: "503",
				db_type: "pg",
				error_type: "DatabaseError",
				error_code: "42P01",
			},
			fingerprint: ["get_tables", "503", "DatabaseError", "42P01"],
		});
	});

	it("does not report expected client errors", () => {
		captureServerError(new Error("invalid filter"), {
			operation: "get_tables",
			status: 400,
			dbType: "pg",
		});

		expect(sentry.captureException).not.toHaveBeenCalled();
	});
});

const reportedStack = (home: string, frame: string): string => {
	sentry.home = home;
	const error = new Error("pool acquire timeout");
	error.stack = ["Error: pool acquire timeout", `    at getTableColumns (${frame})`].join(
		"\n",
	);
	captureServerError(error, { operation: "get_tables", status: 500, dbType: "pg" });

	return sentry.captureException.mock.calls[0][0].stack;
};

describe("home directory redaction in reported stacks", () => {
	it.each([
		{
			name: "POSIX plain path",
			home: "/Users/jane",
			frame: "/Users/jane/.npm/_npx/abc/node_modules/db-studio/dist/index.js:328:368",
			expected: "~/.npm/_npx/abc/node_modules/db-studio/dist/index.js:328:368",
		},
		{
			name: "Windows hash",
			home: "C:\\Users\\Jane#Doe",
			frame: "file:///C:/Users/Jane%23Doe/dist/index.js:10:5",
			expected: "file:///~/dist/index.js:10:5",
		},
		{
			name: "POSIX question mark",
			home: "/Users/jane?doe",
			frame: "file:///Users/jane%3Fdoe/dist/index.js:10:5",
			expected: "file://~/dist/index.js:10:5",
		},
		{
			name: "Windows trailing percent",
			home: "C:\\Users\\Jane%",
			frame: "file:///C:/Users/Jane%25/dist/index.js:10:5",
			expected: "file:///~/dist/index.js:10:5",
		},
		{
			name: "POSIX trailing percent",
			home: "/Users/jane%",
			frame: "file:///Users/jane%25/dist/index.js:10:5",
			expected: "file://~/dist/index.js:10:5",
		},
		{
			name: "Unicode with hash",
			home: "/Users/Hüsam#Yıldırım",
			frame: "file:///Users/H%C3%BCsam%23Y%C4%B1ld%C4%B1r%C4%B1m/dist/index.js:10:5",
			expected: "file://~/dist/index.js:10:5",
		},
	])(
		"redacts a $name home without changing the remaining frame",
		({ home, frame, expected }) => {
			expect(reportedStack(home, frame)).toBe(
				`Error: get_tables failed with 500\n    at getTableColumns (${expected})`,
			);
		},
	);

	it("redacts a Windows home directory from a file URL frame", () => {
		const stack = reportedStack(
			"C:\\Users\\Jane Doe",
			"file:///C:/Users/Jane%20Doe/AppData/Local/Programs/db-studio/resources/server/index.js:10:5",
		);

		expect(stack).not.toContain("Jane");
		expect(stack).toContain(
			"at getTableColumns (file:///~/AppData/Local/Programs/db-studio/resources/server/index.js:10:5)",
		);
	});

	it("redacts a Windows home directory from a decoded forward-slash frame", () => {
		const stack = reportedStack(
			"C:\\Users\\Jane Doe",
			"file:///C:/Users/Jane Doe/AppData/Local/npm-cache/_npx/abc/node_modules/db-studio/dist/index.js:1:2",
		);

		expect(stack).not.toContain("Jane");
	});

	it("redacts a home directory with a space from a POSIX file URL frame", () => {
		const stack = reportedStack(
			"/Users/jane doe",
			"file:///Users/jane%20doe/.npm/_npx/abc/node_modules/db-studio/dist/index.js:1:2",
		);

		expect(stack).not.toContain("jane");
		expect(stack).toContain("file://~/.npm/_npx/abc/node_modules/db-studio/dist/index.js:1:2");
	});

	it("redacts a Windows home directory from a backslashed frame", () => {
		const stack = reportedStack(
			"C:\\Users\\Jane Doe",
			"C:\\Users\\Jane Doe\\AppData\\Local\\npm-cache\\_npx\\abc\\index.cjs:1:2",
		);

		expect(stack).not.toContain("Jane");
		expect(stack).toContain("~\\AppData\\Local\\npm-cache\\_npx\\abc\\index.cjs:1:2");
	});
});
