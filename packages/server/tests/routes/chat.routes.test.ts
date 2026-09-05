import { Hono } from "hono";
import { LIMIT } from "@db-studio/shared/constants";
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

const requestBody = (
	includeSchema: boolean,
	provider: "gemini" | "anthropic" = "gemini",
	model = "gemini-3-flash-preview",
) => ({
	provider,
	model,
	messages: [{ id: "message-1", role: "user", content: "Hello" }],
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

	it("forwards only the selected provider key and model", async () => {
		const response = await app.request("/api/pg/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-byok-anthropic": "anthropic-secret",
			},
			body: JSON.stringify(requestBody(true, "anthropic", "claude-sonnet-4-6")),
		});

		expect(response.status).toBe(200);
		const [, init] = vi.mocked(fetch).mock.calls[0];
		const headers = new Headers(init?.headers);
		expect(headers.get("x-byok-anthropic")).toBe("anthropic-secret");
		expect(headers.get("x-byok-gemini")).toBe("");
		expect(String(init?.body)).toContain('"provider":"anthropic"');
		expect(String(init?.body)).toContain('"model":"claude-sonnet-4-6"');
		expect(String(init?.body)).not.toContain("anthropic-secret");
	});

	it("defaults the model to the selected provider's first model", async () => {
		const response = await app.request("/api/pg/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				provider: "openai",
				messages: [{ id: "message-1", role: "user", content: "Hello" }],
				data: { db: "example", includeSchema: false },
			}),
		});

		expect(response.status).toBe(200);
		const [, init] = vi.mocked(fetch).mock.calls[0];
		// A fixed Gemini default here would be rejected by the proxy with a 400.
		expect(String(init?.body)).toContain('"model":"gpt-5.2"');
	});

	it("relays the proxy stream response without creating a detached stream", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			new Response("data: done\n\n", {
				status: 200,
				headers: {
					"Content-Type": "text/event-stream",
					"x-stream-source": "proxy",
				},
			}),
		);

		const response = await app.request("/api/pg/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody(false)),
		});

		expect(response.headers.get("x-stream-source")).toBe("proxy");
		expect(await response.text()).toBe("data: done\n\n");
	});

	it("reports hosted quota as unavailable when the proxy limit check fails", async () => {
		vi.mocked(fetch).mockRejectedValueOnce(new Error("proxy unavailable"));

		const response = await app.request("/api/pg/chat/limit");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ limit: LIMIT, used: LIMIT, remaining: 0 });
	});
});
