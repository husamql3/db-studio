import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { DEFAULTS } from "shared/constants";
import {
	type AnalyzeQueryResult,
	type ApiError,
	analyzeQuerySchema,
	databaseSchema,
	type ExecuteQueryResult,
	executeQuerySchema,
	type SuggestOptimizationResult,
	suggestOptimizationSchema,
} from "shared/types";
import type { ApiErrorType, ApiHandler } from "@/app.types.js";
import { analyzeQuery, executeQuery, executeQuerySandbox } from "@/dao/query.dao.js";
import { getDetailedSchema } from "@/dao/table-details-schema.js";
import { readSseText } from "@/utils/read-sse-text.js";
import { generateSystemPrompt } from "@/utils/system-prompt-generator.js";

/** Validate BYOC proxy URL: https only to avoid SSRF */
function getProxyUrl(proxyUrl?: string): string {
	if (!proxyUrl || !proxyUrl.trim()) return DEFAULTS.PROXY_URL;
	try {
		const url = new URL(proxyUrl.trim());
		if (url.protocol !== "https:") return DEFAULTS.PROXY_URL;
		return url.origin;
	} catch {
		return DEFAULTS.PROXY_URL;
	}
}

export const queryRoutes = new Hono()
	/**
	 * Base path for the endpoints, /:dbType/query/...
	 */
	.basePath("/query")

	/**
	 * POST /query
	 * Executes a SQL query on the currently connected database
	 * @param {DatabaseSchemaType} query - The database to use
	 * @param {ExecuteQuerySchemaType} json - The query to execute
	 * @returns {ApiHandler<ExecuteQueryResult>} The result of the query
	 */
	.post(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", executeQuerySchema),
		async (c): ApiHandler<ExecuteQueryResult> => {
			const { query } = c.req.valid("json");
			const { db } = c.req.valid("query");
			const data = await executeQuery({ query, db });
			return c.json({ data }, 200);
		},
	)

	/**
	 * POST /query/sandbox
	 * Executes a SQL query in a sandbox (transaction + rollback)
	 * @param {DatabaseSchemaType} query - The database to use
	 * @param {ExecuteQuerySchemaType} json - The query to execute
	 * @returns {ApiHandler<ExecuteQueryResult>} The result of the query
	 */
	.post(
		"/sandbox",
		zValidator("query", databaseSchema),
		zValidator("json", executeQuerySchema),
		async (c): ApiHandler<ExecuteQueryResult> => {
			const { query } = c.req.valid("json");
			const { db } = c.req.valid("query");
			const data = await executeQuerySandbox({ query, db });
			return c.json({ data }, 200);
		},
	)

	/**
	 * POST /query/analyze
	 * Runs EXPLAIN ANALYZE for timing and plan insights
	 */
	.post(
		"/analyze",
		zValidator("query", databaseSchema),
		zValidator("json", analyzeQuerySchema),
		async (c): ApiHandler<AnalyzeQueryResult> => {
			const { query } = c.req.valid("json");
			const { db } = c.req.valid("query");
			const data = await analyzeQuery({ query, db });
			return c.json({ data }, 200);
		},
	)

	/**
	 * POST /query/suggest-optimization
	 * Suggest a faster version of a query
	 */
	.post(
		"/suggest-optimization",
		zValidator("query", databaseSchema),
		zValidator("json", suggestOptimizationSchema),
		async (c): ApiHandler<SuggestOptimizationResult> => {
			const { db } = c.req.valid("query");
			const { query, proxyUrl, provider, model, apiKey } = c.req.valid("json");

			const schema = await getDetailedSchema(db);
			const systemPrompt = generateSystemPrompt(schema);
			const prompt = `Optimize the following SQL query for performance. Keep semantics identical.\n\nQuery:\n${query}\n\nReturn ONLY valid JSON with keys: suggestedQuery, explanation.`;

			const proxyUrlToUse = getProxyUrl(proxyUrl);

			const proxyResponse = await fetch(`${proxyUrlToUse}/chat`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					messages: [{ role: "user", content: prompt }],
					systemPrompt,
					conversationId: "suggest-optimization",
					provider,
					model,
					apiKey,
				}),
			});

			if (!proxyResponse.ok) {
				const errorData = (await proxyResponse.json()) as { error?: string };
				const status = proxyResponse.status === 400 ? 400 : 500;
				return c.json(
					{ error: errorData.error ?? "Proxy request failed" } satisfies ApiError,
					status,
				) as unknown as ApiErrorType;
			}

			const rawText = await readSseText(proxyResponse);
			let parsed: SuggestOptimizationResult | null = null;
			try {
				parsed = JSON.parse(rawText) as SuggestOptimizationResult;
			} catch {
				parsed = null;
			}

			if (!parsed?.suggestedQuery) {
				return c.json({ error: "Failed to parse AI response" }, 500);
			}

			return c.json({ data: parsed }, 200);
		},
	);

export type QueryRoutes = typeof queryRoutes;
