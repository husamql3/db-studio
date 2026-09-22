import { describe, expect, it } from "vitest";
import { redactOutput, summarizeOutput } from "./redact";

const ESC = String.fromCharCode(27);

describe("redactOutput", () => {
	it("removes credentials and ANSI colors", () => {
		expect(
			redactOutput(
				`${ESC}[31mconnect ECONNREFUSED postgres://admin:hunter2@db:5432/app${ESC}[0m`,
			),
		).toBe("connect ECONNREFUSED postgres://***@db:5432/app");
	});
});

describe("summarizeOutput", () => {
	it("keeps only the last informative lines", () => {
		const lines = [
			"│",
			"◇  Connecting to PostgreSQL...",
			"",
			"└  Startup failed: password authentication failed",
		];
		expect(summarizeOutput(lines, 1)).toBe(
			"└  Startup failed: password authentication failed",
		);
		expect(summarizeOutput(lines)).toBe(
			"◇  Connecting to PostgreSQL...\n└  Startup failed: password authentication failed",
		);
	});
});
