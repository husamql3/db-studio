import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HTTPException } from "hono/http-exception";
import {
	captureServerError,
	databaseTypeForRequest,
	durationBucket,
	operationForRequest,
	outcomeForStatus,
} from "@/observability.js";

const sentry = vi.hoisted(() => ({
	captureException: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
	captureException: sentry.captureException,
	close: vi.fn(),
	getClient: vi.fn(),
	init: vi.fn(),
	isInitialized: vi.fn(() => false),
	startSpan: vi.fn((_options, callback: () => unknown) => callback()),
}));

describe("observability privacy boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("DB_STUDIO_DATA_DIR", `/tmp/db-studio-observability-${process.pid}`);
	});

	afterEach(() => vi.unstubAllEnvs());

	it("classifies routes without retaining user-controlled path values", () => {
		expect(operationForRequest("GET", "/api/pg/tables/customer-secrets")).toBe("get_tables");
		expect(operationForRequest("POST", "/api/query/private-query-id")).toBe("post_query");
		expect(operationForRequest("GET", "/api/unknown/private-value")).toBe("get_other");
		expect(databaseTypeForRequest("/api/mysql/tables/customer-secrets")).toBe("mysql");
		expect(databaseTypeForRequest("/api/unknown/private-value")).toBeUndefined();
	});

	it("buckets outcomes and latency without retaining exact measurements", () => {
		expect(outcomeForStatus(200)).toBe("success");
		expect(outcomeForStatus(404)).toBe("client_error");
		expect(outcomeForStatus(503)).toBe("server_error");
		expect(durationBucket(99)).toBe("under_100ms");
		expect(durationBucket(1_500)).toBe("1s_5s");
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
			message: "Server operation failed",
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
