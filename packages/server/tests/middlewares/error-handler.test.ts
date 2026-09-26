import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { DatabaseError } from "pg";

import { handleError } from "@/middlewares/error-handler.js";

describe("Error Handler Middleware", () => {
	let app: Hono;

	beforeEach(() => {
		app = new Hono();
		app.onError(handleError);
	});

	describe("ZodError handling", () => {
		it("should surface the first issue message with a 400", async () => {
			const schema = z.object({ name: z.string().min(1, "Name is required") });

			app.get("/test", () => {
				schema.parse({ name: "" });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe("Validation error");
			expect(json.details).toBe("Name is required");
		});
	});

	describe("Database connection error handling", () => {
		it("should return 503 for ECONNREFUSED error", async () => {
			app.get("/test", () => {
				throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
			expect(json.details).toContain("ECONNREFUSED");
		});

		it("should return 503 for DatabaseError with connection exception code", async () => {
			app.get("/test", () => {
				const dbError = new DatabaseError("Connection error", 0, "error");
				dbError.code = "08000"; // Connection exception class
				throw dbError;
			});

			const res = await app.request("/test");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should return 500, not 503, for a non-connection DatabaseError", async () => {
			app.get("/test", () => {
				const dbError = new DatabaseError("syntax error at or near", 0, "error");
				dbError.code = "42601";
				throw dbError;
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toContain("syntax error");
		});
	});

	describe("Error logging", () => {
		/** Errors are logged as one structured JSON line on stderr, not via console.error. */
		const captureStderr = () => {
			const lines: string[] = [];
			const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
				lines.push(String(chunk));
				return true;
			});
			return { lines, restore: () => spy.mockRestore() };
		};

		const findLog = (lines: string[], event: string) =>
			lines
				.map((line) => {
					try {
						return JSON.parse(line) as Record<string, unknown>;
					} catch {
						return undefined;
					}
				})
				.find((entry) => entry?.event === event);

		it("should log errors as structured stderr output", async () => {
			const stderr = captureStderr();

			app.get("/test", () => {
				throw new Error("Test error for logging");
			});

			await app.request("/test");
			stderr.restore();

			const entry = findLog(stderr.lines, "request_failed");
			expect(entry).toBeDefined();
			expect(entry).toMatchObject({ level: "error", operation: "get_other", error_type: "Error" });
			expect(typeof entry?.timestamp).toBe("string");
		});

		it("should log HTTPException with its error type", async () => {
			const stderr = captureStderr();

			app.get("/test", () => {
				throw new HTTPException(404, { message: "Not found" });
			});

			await app.request("/test");
			stderr.restore();

			expect(findLog(stderr.lines, "request_failed")).toMatchObject({
				level: "error",
				error_type: "HTTPException",
			});
		});

		it("should not leak the error message into the log line", async () => {
			const stderr = captureStderr();

			app.get("/test", () => {
				throw new Error("connection to user@secret-host failed");
			});

			await app.request("/test");
			stderr.restore();

			expect(stderr.lines.join("")).not.toContain("secret-host");
		});
	});
});
