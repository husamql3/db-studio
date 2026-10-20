import { DEFAULTS } from "@db-studio/shared/constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	args: vi.fn(),
	loadEnv: vi.fn(),
	getDatabaseUrl: vi.fn(),
	connect: vi.fn(),
	getDatabaseConnectionDetails: vi.fn(),
	openBrowser: vi.fn(),
	shouldOpenBrowser: vi.fn(),
	createServer: vi.fn(),
	listen: vi.fn(),
	intro: vi.fn(),
	outro: vi.fn(),
	log: {
		success: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	},
	spinner: vi.fn(() => ({
		start: vi.fn(),
		stop: vi.fn(),
	})),
}));

vi.mock("@clack/prompts", () => ({
	intro: mocks.intro,
	outro: mocks.outro,
	log: mocks.log,
	spinner: mocks.spinner,
}));

vi.mock("@/cmd/args.js", () => ({
	args: mocks.args,
}));

vi.mock("@/cmd/load-env.js", () => ({
	loadEnv: mocks.loadEnv,
}));

vi.mock("@/cmd/get-db-url.js", () => ({
	getDatabaseUrl: mocks.getDatabaseUrl,
}));

vi.mock("@/cmd/check-database.js", () => ({
	getDatabaseConnectionDetails: mocks.getDatabaseConnectionDetails,
}));

vi.mock("@/connection.js", () => ({
	connect: mocks.connect,
}));

vi.mock("@/cmd/open-browser.js", () => ({
	openBrowser: mocks.openBrowser,
	shouldOpenBrowser: mocks.shouldOpenBrowser,
}));

vi.mock("@/utils/create-server.js", () => ({
	createServer: mocks.createServer,
}));

import { main } from "@/index.js";

describe("main configuration resolution", () => {
	const initialEnv = { ...process.env };

	beforeEach(() => {
		vi.clearAllMocks();
		process.env = { ...initialEnv };
		delete process.env.PORT;
		delete process.env.HOST;

		mocks.args.mockReturnValue({
			env: undefined,
			port: undefined,
			databaseUrl: "postgresql://localhost:5432/test",
			varName: undefined,
			open: false,
			status: false,
			help: false,
			version: false,
		});
		mocks.loadEnv.mockResolvedValue({});
		mocks.getDatabaseUrl.mockReturnValue("postgresql://localhost:5432/test");
		mocks.getDatabaseConnectionDetails.mockReturnValue({
			type: "pg",
			name: "PostgreSQL",
			destination: "localhost:5432",
		});
		mocks.connect.mockResolvedValue(null);
		mocks.shouldOpenBrowser.mockReturnValue(false);
		mocks.createServer.mockReturnValue({ app: { listen: mocks.listen } });
	});

	afterEach(() => {
		process.env = { ...initialEnv };
	});

	it("reads PORT and HOST from .env when not supplied through environment or CLI", async () => {
		mocks.loadEnv.mockResolvedValue({
			PORT: "8080",
			HOST: "127.0.0.1",
		});

		await main();

		expect(mocks.listen).toHaveBeenCalledWith(
			expect.objectContaining({
				port: 8080,
				hostname: "127.0.0.1",
			}),
		);
		expect(process.env.PORT).toBe("8080");
		expect(process.env.HOST).toBe("127.0.0.1");
	});

	it("preserves CLI port precedence over .env PORT", async () => {
		mocks.args.mockReturnValue({
			port: "9000",
			databaseUrl: "postgresql://localhost:5432/test",
		});
		mocks.loadEnv.mockResolvedValue({
			PORT: "8080",
		});

		await main();

		expect(mocks.listen).toHaveBeenCalledWith(
			expect.objectContaining({
				port: 9000,
			}),
		);
	});

	it("preserves environment variables over .env PORT and HOST", async () => {
		process.env.PORT = "7000";
		process.env.HOST = "0.0.0.0";

		mocks.loadEnv.mockResolvedValue({
			PORT: "8080",
			HOST: "127.0.0.1",
		});

		await main();

		expect(mocks.listen).toHaveBeenCalledWith(
			expect.objectContaining({
				port: 7000,
				hostname: "0.0.0.0",
			}),
		);
	});

	it("falls back to the default PORT and the loopback HOST when not configured", async () => {
		mocks.loadEnv.mockResolvedValue({});

		await main();

		expect(mocks.listen).toHaveBeenCalledWith(
			expect.objectContaining({
				port: DEFAULTS.PORT,
				hostname: "127.0.0.1",
			}),
		);
	});

	it("starts the server without connecting when no database URL is configured", async () => {
		mocks.args.mockReturnValue({ databaseUrl: undefined });
		mocks.getDatabaseUrl.mockReturnValue(undefined);

		await main();

		expect(mocks.connect).not.toHaveBeenCalled();
		expect(mocks.listen).toHaveBeenCalledWith(expect.objectContaining({ port: DEFAULTS.PORT }));
	});
});
