import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import { RedisAdapter } from "@/adapters/redis/redis.adapter.js";

const wrap = (adapter: RedisAdapter, error: unknown): HTTPException =>
	(adapter as unknown as { wrapError: (e: unknown) => HTTPException }).wrapError(error);

describe("RedisAdapter — error mapping (wrapError)", () => {
	const adapter = new RedisAdapter();

	const cases: { name: string; message: string }[] = [
		{ name: "NOAUTH", message: "NOAUTH Authentication required." },
		{ name: "WRONGPASS", message: "WRONGPASS invalid username-password pair" },
		{ name: "LOADING", message: "LOADING Redis is loading the dataset in memory" },
		{ name: "BUSY", message: "BUSY Redis is busy running a script" },
		{
			name: "READONLY",
			message: "READONLY You can't write against a read only replica.",
		},
		{ name: "CLUSTERDOWN", message: "CLUSTERDOWN The cluster is down" },
	];

	for (const { name, message } of cases) {
		it(`maps ${name} to 503`, () => {
			const wrapped = wrap(adapter, new Error(message));
			expect(wrapped.status).toBe(503);
		});
	}

	it("maps cluster-not-supported rejection to 503", () => {
		const wrapped = wrap(adapter, new Error("Redis cluster mode is not supported"));
		expect(wrapped.status).toBe(503);
	});

	it("maps ECONNREFUSED to 503", () => {
		const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:6379"), {
			code: "ECONNREFUSED",
		});
		expect(wrap(adapter, error).status).toBe(503);
	});

	it("preserves HTTPExceptions verbatim", () => {
		const http = new HTTPException(409, { message: "exists" });
		expect(wrap(adapter, http)).toBe(http);
	});

	it("maps unknown Redis reply errors to 500", () => {
		const wrapped = wrap(adapter, new Error("WRONGTYPE Operation against a key…"));
		expect(wrapped.status).toBe(500);
	});
});
