import { z } from "zod";
import { databaseSchema } from "./database.types.js";

// UI message part schema (from @tanstack/ai-react)
const messagePart = z
	.object({
		type: z.string(),
		content: z.string().optional(),
	})
	.passthrough();

// `@tanstack/ai-react`'s `fetchServerSentEvents` adapter sends UI messages
// with `parts` (not `content`) and wraps extra body under `data`.
export const chatSchema = z.object({
	messages: z.array(
		z
			.object({
				id: z.string(),
				role: z.enum(["user", "assistant", "system", "tool"]),
				parts: z.array(messagePart),
			})
			.passthrough(),
	),
	data: z.object({
		conversationId: z.string().optional(),
		db: databaseSchema.shape.db,
	}),
});
