import { z } from "zod";
import { databaseSchema } from "./database.types.js";

const messageSchema = z.object({
	role: z.enum(["user", "assistant"]),
	content: z.string("Content is required"),
});

/** Optional nested payload from TanStack AI client (body.data) */
const chatDataSchema = z.object({
	conversationId: z.string().optional(),
	db: databaseSchema.shape.db.optional(),
	includeSchemaInAiContext: z.boolean().optional(),
	proxyUrl: z.string().optional(),
	provider: z.string().optional(),
	model: z.string().optional(),
	apiKey: z.string().optional(),
});

/** Accepts flat body or TanStack shape { messages, data: { conversationId, db, ... } } */
export const chatSchema = z
	.object({
		messages: z.array(messageSchema),
		conversationId: z.string().optional(),
		db: databaseSchema.shape.db.optional(),
		includeSchemaInAiContext: z.boolean().optional(),
		proxyUrl: z.string().optional(),
		provider: z.string().optional(),
		model: z.string().optional(),
		apiKey: z.string().optional(),
		data: chatDataSchema.optional(),
	})
	.refine(
		(v) => v.db !== undefined || v.data?.db !== undefined,
		"db is required (top-level or in data)",
	)
	.transform((v) => ({
		messages: v.messages,
		conversationId: v.conversationId ?? v.data?.conversationId,
		db: (v.db ?? v.data?.db) as string,
		includeSchemaInAiContext: v.includeSchemaInAiContext ?? v.data?.includeSchemaInAiContext,
		proxyUrl: v.proxyUrl ?? v.data?.proxyUrl,
		provider: v.provider ?? v.data?.provider,
		model: v.model ?? v.data?.model,
		apiKey: v.apiKey ?? v.data?.apiKey,
	}));
