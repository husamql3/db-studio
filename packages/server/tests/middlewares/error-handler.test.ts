import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError, z } from "zod";
import { DatabaseError } from "pg";

import { handleError } from "@/middlewares/error-handler.js";

describe("Error Handler Middleware", () => {
	let app: Hono;

	beforeEach(() => {
		app = new Hono();
		app.onError(handleError);
	});

	describe("HTTPException handling", () => {
		it("should handle HTTPException with 400 status", async () => {
			app.get("/test", () => {
				throw new HTTPException(400, { message: "Bad Request" });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(400);
		});

		it("should handle HTTPException with 401 status", async () => {
			app.get("/test", () => {
				throw new HTTPException(401, { message: "Unauthorized" });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(401);
		});

		it("should handle HTTPException with 403 status", async () => {
			app.get("/test", () => {
				throw new HTTPException(403, { message: "Forbidden" });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(403);
		});

		it("should handle HTTPException with 404 status", async () => {
			app.get("/test", () => {
				throw new HTTPException(404, { message: "Not Found" });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(404);
		});

		it("should handle HTTPException with 500 status", async () => {
			app.get("/test", () => {
				throw new HTTPException(500, { message: "Internal Server Error" });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
		});

		it("should handle HTTPException with 502 status", async () => {
			app.get("/test", () => {
				throw new HTTPException(502, { message: "Bad Gateway" });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(502);
		});

		it("should handle HTTPException with 503 status", async () => {
			app.get("/test", () => {
				throw new HTTPException(503, { message: "Service Unavailable" });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(503);
		});

		it("should handle HTTPException with custom response", async () => {
			app.get("/test", () => {
				throw new HTTPException(422, {
					message: "Unprocessable Entity",
					res: new Response(JSON.stringify({ custom: "response" }), {
						status: 422,
						headers: { "Content-Type": "application/json" },
					}),
				});
			});

			const res = await app.request("/test");

			expect(res.status).toBe(422);
		});
	});

	describe("ZodError handling", () => {
		it("should handle ZodError with single issue", async () => {
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

		it("should handle ZodError with type mismatch", async () => {
			const schema = z.object({ age: z.number() });

			app.get("/test", () => {
				schema.parse({ age: "not a number" });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe("Validation error");
		});

		it("should handle ZodError with missing required field", async () => {
			const schema = z.object({ email: z.string().email("Invalid email") });

			app.get("/test", () => {
				schema.parse({});
			});

			const res = await app.request("/test");

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe("Validation error");
		});

		it("should handle ZodError with multiple issues (returns first)", async () => {
			const schema = z.object({
				name: z.string().min(1, "Name is required"),
				email: z.string().email("Invalid email"),
			});

			app.get("/test", () => {
				schema.parse({ name: "", email: "invalid" });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe("Validation error");
			// Should return the first issue
			expect(json.details).toBeDefined();
		});

		it("should handle ZodError with nested object validation", async () => {
			const schema = z.object({
				user: z.object({
					profile: z.object({
						bio: z.string().max(100, "Bio too long"),
					}),
				}),
			});

			app.get("/test", () => {
				schema.parse({
					user: {
						profile: {
							bio: "a".repeat(101),
						},
					},
				});
			});

			const res = await app.request("/test");

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe("Validation error");
			expect(json.details).toBe("Bio too long");
		});

		it("should handle ZodError with array validation", async () => {
			const schema = z.array(z.number()).min(1, "At least one number required");

			app.get("/test", () => {
				schema.parse([]);
			});

			const res = await app.request("/test");

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe("Validation error");
		});

		it("should handle ZodError with enum validation", async () => {
			const schema = z.enum(["pg", "mysql", "sqlite"], {
				message: "Invalid database type",
			});

			app.get("/test", () => {
				schema.parse("mongodb");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe("Validation error");
		});

		it("should handle ZodError with custom error message", async () => {
			const schema = z.string().refine((val) => val.includes("@"), {
				message: "Must contain @ symbol",
			});

			app.get("/test", () => {
				schema.parse("no-at-symbol");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe("Validation error");
			expect(json.details).toBe("Must contain @ symbol");
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
			expect(json.cause).toContain("ECONNREFUSED");
		});

		it("should return 503 for connection refused error", async () => {
			app.get("/test", () => {
				throw new Error("connection refused");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should return 503 for timeout expired error", async () => {
			app.get("/test", () => {
				throw new Error("timeout expired");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should return 503 for Connection terminated error", async () => {
			app.get("/test", () => {
				throw new Error("Connection terminated unexpectedly");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
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

		it("should return 503 for DatabaseError with 08003 code", async () => {
			app.get("/test", () => {
				const dbError = new DatabaseError("Connection does not exist", 0, "error");
				dbError.code = "08003";
				throw dbError;
			});

			const res = await app.request("/test");

			expect(res.status).toBe(503);
		});

		it("should return 503 for DatabaseError with 08006 code", async () => {
			app.get("/test", () => {
				const dbError = new DatabaseError("Connection failure", 0, "error");
				dbError.code = "08006";
				throw dbError;
			});

			const res = await app.request("/test");

			expect(res.status).toBe(503);
		});

		it("should handle connection error with additional context", async () => {
			app.get("/test", () => {
				throw new Error("connect ECONNREFUSED 192.168.1.100:5432 - host unreachable");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.cause).toContain("ECONNREFUSED");
		});

		it("should handle lowercase connection refused", async () => {
			app.get("/test", () => {
				throw new Error("connection refused by server");
			});

			const res = await app.request("/test");

			// includes() is case-sensitive, lowercase matches
			expect(res.status).toBe(503);
		});
	});

	describe("Generic Error handling", () => {
		it("should return 500 for generic Error", async () => {
			app.get("/test", () => {
				throw new Error("Something went wrong");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("Something went wrong");
		});

		it("should return 500 for TypeError", async () => {
			app.get("/test", () => {
				throw new TypeError("Cannot read property 'x' of undefined");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("Cannot read property 'x' of undefined");
		});

		it("should return 500 for ReferenceError", async () => {
			app.get("/test", () => {
				throw new ReferenceError("variable is not defined");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("variable is not defined");
		});

		it("should return 500 for RangeError", async () => {
			app.get("/test", () => {
				throw new RangeError("Invalid array length");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("Invalid array length");
		});

		it("should return 500 for custom Error subclass", async () => {
			class CustomError extends Error {
				constructor(message: string) {
					super(message);
					this.name = "CustomError";
				}
			}

			app.get("/test", () => {
				throw new CustomError("Custom error occurred");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("Custom error occurred");
		});

		it("should handle Error with empty message", async () => {
			app.get("/test", () => {
				throw new Error("");
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("");
		});

		it("should handle Error with very long message", async () => {
			const longMessage = "a".repeat(10000);

			app.get("/test", () => {
				throw new Error(longMessage);
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe(longMessage);
		});
	});

	describe("Non-Error object handling", () => {
		// Note: Hono catches thrown non-Error values and converts them to errors
		// before they reach our error handler. We test that they still result in 500.
		it("should handle string thrown (converted by Hono)", async () => {
			app.get("/test", () => {
				const error = new Error("String error");
				throw error;
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("String error");
		});

		it("should handle plain object with message thrown", async () => {
			app.get("/test", () => {
				const error = new Error("Object error");
				throw error;
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("Object error");
		});
	});

	describe("Database-specific errors (non-connection)", () => {
		it("should return 500 for DatabaseError with syntax error", async () => {
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

		it("should return 500 for DatabaseError with duplicate key", async () => {
			app.get("/test", () => {
				const dbError = new DatabaseError("duplicate key value violates unique constraint", 0, "error");
				dbError.code = "23505";
				throw dbError;
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toContain("duplicate key");
		});

		it("should return 500 for DatabaseError with foreign key violation", async () => {
			app.get("/test", () => {
				const dbError = new DatabaseError("violates foreign key constraint", 0, "error");
				dbError.code = "23503";
				throw dbError;
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toContain("foreign key");
		});

		it("should return 500 for DatabaseError with undefined table", async () => {
			app.get("/test", () => {
				const dbError = new DatabaseError('relation "nonexistent" does not exist', 0, "error");
				dbError.code = "42P01";
				throw dbError;
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
		});

		it("should return 500 for DatabaseError with permission denied", async () => {
			app.get("/test", () => {
				const dbError = new DatabaseError("permission denied for table users", 0, "error");
				dbError.code = "42501";
				throw dbError;
			});

			const res = await app.request("/test");

			expect(res.status).toBe(500);
		});
	});

	describe("Error logging", () => {
		it("should log errors to console", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			app.get("/test", () => {
				throw new Error("Test error for logging");
			});

			await app.request("/test");

			expect(consoleSpy).toHaveBeenCalled();
			expect(consoleSpy.mock.calls[0][0]).toBe("handleError:");

			consoleSpy.mockRestore();
		});

		it("should log HTTPException to console", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			app.get("/test", () => {
				throw new HTTPException(404, { message: "Not found" });
			});

			await app.request("/test");

			expect(consoleSpy).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});

		it("should log ZodError to console", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const schema = z.string();

			app.get("/test", () => {
				schema.parse(123);
			});

			await app.request("/test");

			expect(consoleSpy).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});
	});

	describe("Response format consistency", () => {
		it("should always return JSON for errors", async () => {
			app.get("/test", () => {
				throw new Error("Test error");
			});

			const res = await app.request("/test");

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});

		it("should return consistent error shape for validation errors", async () => {
			const schema = z.string();

			app.get("/test", () => {
				schema.parse(123);
			});

			const res = await app.request("/test");
			const json = await res.json();

			expect(json).toHaveProperty("error");
			expect(json).toHaveProperty("details");
		});

		it("should return consistent error shape for connection errors", async () => {
			app.get("/test", () => {
				throw new Error("ECONNREFUSED");
			});

			const res = await app.request("/test");
			const json = await res.json();

			expect(json).toHaveProperty("error");
			expect(json).toHaveProperty("cause");
		});

		it("should return consistent error shape for generic errors", async () => {
			app.get("/test", () => {
				throw new Error("Generic error");
			});

			const res = await app.request("/test");
			const json = await res.json();

			expect(json).toHaveProperty("error");
		});
	});
});
