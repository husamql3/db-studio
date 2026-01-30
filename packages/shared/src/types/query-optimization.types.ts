import { z } from "zod";

export const analyzeQuerySchema = z.object({
	query: z.string("Query is required"),
});

export type AnalyzeQueryParams = z.infer<typeof analyzeQuerySchema>;

export type AnalyzeQueryResult = {
	plan: unknown;
	executionTimeMs: number;
};

export const suggestOptimizationSchema = z.object({
	query: z.string("Query is required"),
	proxyUrl: z.string().optional(),
	provider: z.string().optional(),
	model: z.string().optional(),
	apiKey: z.string().optional(),
});

export type SuggestOptimizationParams = z.infer<typeof suggestOptimizationSchema>;

export type SuggestOptimizationResult = {
	suggestedQuery: string;
	explanation: string;
};
