import { z } from "zod";
import { databaseSchema } from "./database.types.js";

// `@tanstack/ai-react`'s `fetchServerSentEvents` adapter wraps the body supplied
// to `useChat` under a `data` field: `{ messages, data: { ...body, conversationId } }`.
export const chatSchema = z.object({
	messages: z.array(
		z.object({
			role: z.enum(["user", "assistant", "system", "tool"]),
			content: z.string().nullable(),
		}),
	),
	data: z.object({
		conversationId: z.string().optional(),
		db: databaseSchema.shape.db,
	}),
});
