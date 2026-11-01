// Failure modes: the account name in the home directory reaches Sentry when
// 1. a Windows ESM frame names the bundle as a file URL (`file:///C:/Users/<name>/…`),
//    whose forward slashes never match the backslashed `homedir()` (DB-STUDIO-SERVER-Y, -N);
// 2. the home directory holds a space, which the file URL percent-encodes (`<first>%20<last>`);
// 3. a CommonJS frame on Windows keeps the plain backslashed path.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureServerError } from "@/observability.js";

const mocks = vi.hoisted(() => ({ captureException: vi.fn(), home: "" }));

vi.mock("node:os", async (importOriginal) => {
	const os = await importOriginal<typeof import("node:os")>();
	return { ...os, homedir: () => mocks.home };
});

vi.mock("@sentry/node", () => ({
	captureException: mocks.captureException,
	close: vi.fn(),
	getClient: vi.fn(),
	init: vi.fn(),
	isInitialized: vi.fn(() => false),
	startSpan: vi.fn((_options, callback: () => unknown) => callback()),
}));

const reportedStack = (home: string, frame: string): string => {
	mocks.home = home;
	const error = new Error("pool acquire timeout");
	error.stack = ["Error: pool acquire timeout", `    at getTableColumns (${frame})`].join("\n");
	captureServerError(error, { operation: "get_tables", status: 500, dbType: "pg" });
	return mocks.captureException.mock.calls[0][0].stack;
};

describe("home directory redaction in reported stacks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("DB_STUDIO_DATA_DIR", `/tmp/db-studio-observability-${process.pid}`);
	});

	afterEach(() => vi.unstubAllEnvs());

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
