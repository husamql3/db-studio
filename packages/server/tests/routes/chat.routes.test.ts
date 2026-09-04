import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatRoutes } from "@/routes/chat.routes.js";

const mocks = vi.hoisted(() => ({
	getDetailedSchema: vi.fn(),
	generateSystemPrompt: vi.fn(() => "system prompt"),
}));

vi.mock("@/utils/table-details-schema.js", () => ({
	getDetailedSchema: mocks.getDetailedSchema,
}));

vi.mock("@/utils/system-prompt-generator.js", () => ({
	generateSystemPrompt: mocks.generateSystemPrompt,
}));

const requestBody = (includeSchema: boolean) => ({
	messages: [{ id: "message-1", role: "user", parts: [{ type: "text", content: "Hello" }] }],
	data: { db: "example", includeSchema },
});

describe("Chat routes", () => {
	const app = new Hono().route("/api/pg", chatRoutes);

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getDetailedSchema.mockResolvedValue({ dbType: "pg", tables: [] });
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve(
					new Response("data: done\n\n", {
						status: 200,
						headers: { "Content-Type": "text/event-stream" },
					}),
				),
			),
		);
	});

	it("forwards a Gemini BYOK header without putting the key in the body", async () => {
		const response = await app.request("/api/pg/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-byok-gemini": "personal-secret",
			},
			body: JSON.stringify(requestBody(true)),
		});

		expect(response.status).toBe(200);
		const [, init] = vi.mocked(fetch).mock.calls[0];
		expect(new Headers(init?.headers).get("x-byok-gemini")).toBe("personal-secret");
		expect(String(init?.body)).not.toContain("personal-secret");
	});

	it("does not introspect the database when schema context is disabled", async () => {
		const response = await app.request("/api/pg/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody(false)),
		});

		expect(response.status).toBe(200);
		expect(mocks.getDetailedSchema).not.toHaveBeenCalled();
		expect(mocks.generateSystemPrompt).toHaveBeenCalledWith(null);
	});
});
