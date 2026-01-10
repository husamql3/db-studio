import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { createGeminiChat } from "@tanstack/ai-gemini";
import { Hono } from "hono";
import { getDetailedSchema, getLightweightSchema } from "@/dao/table-details-schema.js";
import { generateSystemPrompt } from "@/utils/system-prompt-generator.js";

export const chatRoutes = new Hono();

// todo: DELETE THIS AFTER TESTING
const GEMINI_API_KEY = "AIzaSyB-IdyC9EC86Sp2tay6okdOKfibkbGMSMY";

/**
 * POST /chat - Handle AI chat requests with streaming
 */
chatRoutes.post("/", async (c) => {
	if (!GEMINI_API_KEY) {
		return c.json(
			{
				error: "GEMINI_API_KEY not configured",
			},
			500,
		);
	}

	try {
		const { messages, conversationId } = await c.req.json();

		const isFirstMessage = !messages || messages.length === 1;
		const schema = isFirstMessage
			? await getDetailedSchema()
			: await getLightweightSchema();

		const systemPrompt = generateSystemPrompt(schema);

		const stream = chat({
			adapter: createGeminiChat("gemini-3-flash-preview", GEMINI_API_KEY, {
				temperature: 0.1, // Very low - we want deterministic, accurate SQL
				topP: 0.9, // Very low - we want deterministic, accurate SQL
				maxOutputTokens: 1024, // Short responses - SQL + brief explanation
			}),
			messages,
			conversationId,
			systemPrompts: [systemPrompt],
		});

		return toServerSentEventsResponse(stream);
	} catch (error) {
		console.error("POST /chat error:", error);
		const errorMessage = error instanceof Error ? error.message : "An error occurred";
		return c.json(
			{
				error: errorMessage,
			},
			500,
		);
	}
});
