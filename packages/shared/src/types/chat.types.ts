import { z } from "zod";

export const chatSchema = z.object({
	messages: z.array(
		z.object({
			role: z.enum(["user", "assistant"]),
			content: z.string("Content is required"),
		}),
	),
	conversationId: z.string().optional(),
});
