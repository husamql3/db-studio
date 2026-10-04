import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, apiOperationForRequest, getBaseUrl } from "./client";

const sentry = vi.hoisted(() => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn(),
}));

vi.mock("@/lib/sentry", () => ({ Sentry: sentry }));
vi.mock("@/lib/logger", () => ({
	logger: { request: vi.fn(), response: vi.fn(), error: vi.fn() },
}));

describe("API error reporting", () => {
	beforeEach(() => vi.clearAllMocks());

	it("does not duplicate server errors in the browser project", async () => {
		const client = new ApiClient(() => "https://db-studio.test");
		client.api.defaults.adapter = async (config) => {
			throw new AxiosError(
				"Request failed",
				"ERR_BAD_RESPONSE",
				config as InternalAxiosRequestConfig,
				undefined,
				{
					config: config as InternalAxiosRequestConfig,
					data: { error: "Database connection failed" },
					headers: {},
					status: 503,
					statusText: "Service Unavailable",
				},
			);
		};

		await expect(client.api.get("/pg/tables")).rejects.toMatchObject({
			message: "Database connection failed",
			status: 503,
		});
		expect(sentry.captureException).not.toHaveBeenCalled();
	});

	it("records API breadcrumbs without database or table identifiers", async () => {
		const client = new ApiClient(() => "https://db-studio.test");
		client.api.defaults.adapter = async (config) => ({
			config: config as InternalAxiosRequestConfig,
			data: {},
			headers: {},
			status: 200,
			statusText: "OK",
		});

		await client.api.get("/pg/tables/customer_secrets?db=private_database");

		expect(
			apiOperationForRequest("GET", "/pg/tables/customer_secrets?db=private_database"),
		).toBe("get_tables");
		expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
			category: "db_studio.http",
			data: { operation: "get_tables", method: "GET" },
			level: "info",
		});
		expect(JSON.stringify(sentry.addBreadcrumb.mock.calls)).not.toContain("customer_secrets");
		expect(JSON.stringify(sentry.addBreadcrumb.mock.calls)).not.toContain("private_database");
	});

	it("reports a network failure that never reached the server", async () => {
		const client = new ApiClient(() => "https://db-studio.test");
		client.api.defaults.adapter = async (config) => {
			throw new AxiosError(
				"connect ECONNREFUSED private-host",
				"ERR_NETWORK",
				config as InternalAxiosRequestConfig,
			);
		};

		await expect(
			client.api.get("/pg/tables/customer_secrets?db=private_database"),
		).rejects.toThrow();

		expect(sentry.captureException).toHaveBeenCalledOnce();
		const [error, context] = sentry.captureException.mock.calls[0];
		expect(error).toMatchObject({ name: "AxiosError", message: "Network request failed" });
		expect(error.stack).not.toContain("private-host");
		expect(context).toEqual({
			tags: {
				source: "client",
				error_kind: "network",
				operation: "get_tables",
				error_code: "ERR_NETWORK",
			},
			fingerprint: ["network", "get_tables", "ERR_NETWORK"],
		});
		expect(JSON.stringify(context)).not.toContain("private-host");
		expect(JSON.stringify(context)).not.toContain("customer_secrets");
	});
});

describe("getBaseUrl", () => {
	afterEach(() => {
		delete window.desktop;
	});

	it("prefers the desktop bridge origin when a server child is running", () => {
		window.desktop = {
			getApiBaseUrl: () => "http://127.0.0.1:43123",
		} as unknown as NonNullable<typeof window.desktop>;

		expect(getBaseUrl()).toBe("http://127.0.0.1:43123");
	});

	it("falls back to the web resolution when the desktop app is disconnected", () => {
		window.desktop = {
			getApiBaseUrl: () => null,
		} as unknown as NonNullable<typeof window.desktop>;

		expect(getBaseUrl()).not.toBe("null");
		expect(getBaseUrl()).toMatch(/^https?:\/\//);
	});
});
