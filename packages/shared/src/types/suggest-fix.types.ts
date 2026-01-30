import { z } from "zod";

export const suggestFixSchema = z.object({
	query: z.string("Query is required"),
	errorMessage: z.string("Error message is required"),
	proxyUrl: z.string().optional(),
	provider: z.string().optional(),
	model: z.string().optional(),
	apiKey: z.string().optional(),
	errorDetails: z
		.object({
			code: z.string().optional(),
			position: z.string().optional(),
			detail: z.string().optional(),
			hint: z.string().optional(),
		})
		.optional(),
});

export type SuggestFixParams = z.infer<typeof suggestFixSchema>;

export type SuggestFixResult = {
	suggestedQuery: string;
	explanation: string;
};
