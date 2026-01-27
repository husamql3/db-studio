import { z } from "zod";
import { databaseSchema } from "./database.types.js";

export const chatSchema = z.object({
	messages: z.array(
		z.object({
			role: z.enum(["user", "assistant"]),
			content: z.string("Content is required"),
		}),
	),
	conversationId: z.string().optional(),
	db: databaseSchema.shape.db,
});
