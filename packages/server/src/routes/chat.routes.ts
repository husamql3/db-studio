import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { Hono } from "hono";

export const chatRoutes = new Hono();

/**
 * POST /chat - Handle AI chat requests with streaming
 */
chatRoutes.post("/", async (c) => {
	// Check for API key
	if (!process.env.GEMINI_API_KEY) {
		return c.json(
			{
				error: "GEMINI_API_KEY not configured",
			},
			500,
		);
	}

	try {
		const { messages, conversationId } = await c.req.json();

		// Create a streaming chat response
		const stream = chat({
			adapter: geminiText("gemini-2.0-flash-exp"),
			messages,
			conversationId,
		});

		// Convert stream to HTTP response
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
