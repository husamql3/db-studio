import { z } from "zod";
import { aiProviderSchema, getDefaultAiModel } from "./ai-provider.types.js";
import { databaseSchema } from "./database.types.js";

// Legacy UI message part schema. Current TanStack AI clients serialize messages
// to the AG-UI wire format (`content` / `toolCalls`) before sending them.
const messagePart = z
	.object({
		type: z.string(),
		content: z.string().optional(),
	})
	.passthrough();

// `fetchServerSentEvents` wraps extra body under `data`. Accept both the current
// AG-UI wire messages and legacy UI messages so older clients remain compatible.
const chatBodySchema = z.object({
	provider: aiProviderSchema.optional().default("gemini"),
	// Left optional here: a fixed default would pair, say, `provider: "openai"`
	// with a Gemini model and the proxy would reject the combination with a 400.
	// The default is resolved from the parsed provider in the transform below.
	model: z.string().min(1).optional(),
	messages: z.array(
		z
			.object({
				id: z.string(),
				role: z.enum(["user", "assistant", "system", "tool", "reasoning"]),
				content: z.union([z.string(), z.null(), z.array(z.unknown())]).optional(),
				parts: z.array(messagePart).optional(),
			})
			.passthrough(),
	),
	data: z.object({
		conversationId: z.string().optional(),
		db: databaseSchema.shape.db,
		includeSchema: z.boolean().optional().default(true),
	}),
});

export const chatSchema = chatBodySchema.transform((body) => ({
	...body,
	model: body.model ?? getDefaultAiModel(body.provider),
}));
