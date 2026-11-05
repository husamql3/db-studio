import { LIMIT } from "@db-studio/shared/constants";
import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatRoutes } from "@/routes/chat/chat.routes.js";

const mocks = vi.hoisted(() => ({
	getDetailedSchema: vi.fn(),
	generateSystemPrompt: vi.fn(() => "system prompt"),
}));

vi.mock("@/routes/chat/table-details-schema.js", () => ({
	getDetailedSchema: mocks.getDetailedSchema,
}));

vi.mock("@/routes/chat/system-prompt-generator.js", () => ({
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
	const app = new Elysia({ prefix: "/api/pg" }).use(chatRoutes);

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
		const response = await app.handle(
			new Request(new URL("/api/pg/chat", "http://localhost"), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-byok-gemini": "personal-secret",
				},
				body: JSON.stringify(requestBody(true)),
			}),
		);

		expect(response.status).toBe(200);
		const [, init] = vi.mocked(fetch).mock.calls[0];
		expect(new Headers(init?.headers).get("x-byok-gemini")).toBe("personal-secret");
		expect(String(init?.body)).not.toContain("personal-secret");
	});

	it("defaults the model to the selected provider's first model", async () => {
		const response = await app.handle(
			new Request(new URL("/api/pg/chat", "http://localhost"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "openai",
					messages: [{ id: "message-1", role: "user", content: "Hello" }],
					data: { db: "example", includeSchema: false },
				}),
			}),
		);

		expect(response.status).toBe(200);
		const [, init] = vi.mocked(fetch).mock.calls[0];
		// A fixed Gemini default here would be rejected by the proxy with a 400.
		expect(String(init?.body)).toContain('"model":"gpt-5.2"');
	});

	// The CLI loads .env after the server modules are imported, so a proxy URL read at import
	// time ignored DB_STUDIO_PROXY_URL from .env.
	it("sends chat to the DB_STUDIO_PROXY_URL set after the routes loaded", async () => {
		vi.stubEnv("DB_STUDIO_PROXY_URL", "http://127.0.0.1:4998");

		try {
			await app.handle(
				new Request(new URL("/api/pg/chat", "http://localhost"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(requestBody(false)),
				}),
			);
		} finally {
			vi.unstubAllEnvs();
		}

		expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe("http://127.0.0.1:4998/chat");
	});

	it("reports hosted quota as unavailable when the proxy limit check fails", async () => {
		vi.mocked(fetch).mockRejectedValueOnce(new Error("proxy unavailable"));

		const response = await app.handle(
			new Request(new URL("/api/pg/chat/limit", "http://localhost")),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ limit: LIMIT, used: LIMIT, remaining: 0 });
	});
});
