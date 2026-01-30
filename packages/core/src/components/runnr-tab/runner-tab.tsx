import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useState } from "react";
import type { ExecuteQueryResult } from "shared/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QueryResultContainer } from "@/components/runnr-tab/query-result-container";
import { RunnerHeader } from "@/components/runnr-tab/runner-header";
import { useExecuteQuery } from "@/hooks/use-execute-query";
import { useAnalyzeQuery } from "@/hooks/use-analyze-query";
import { useSuggestOptimization } from "@/hooks/use-suggest-optimization";
import { useQueriesStore } from "@/stores/queries.store";
import { useInsertSqlStore } from "@/stores/insert-sql.store";
import { PGSQL_PLACEHOLDER_QUERY } from "@/utils/constants/placeholders";

const CodeEditor = lazy(() =>
	import("@/components/runnr-tab/cdoe-editor").then((module) => ({
		default: module.CodeEditor,
	})),
);

export type QueryResult = {
	data: ExecuteQueryResult;
	queryId: string;
};

export const RunnerTab = ({ queryId }: { queryId?: string }) => {
	const navigate = useNavigate();
	const [queryResult, setQueryResult] = useState<QueryResult | undefined>(undefined);
	const { getQuery, updateQuery, toggleFavorite, addQuery } = useQueriesStore();
	const query = queryId ? getQuery(queryId) : null;
	const isFavorite = query?.isFavorite ?? false;
	const {
		executeQuery,
		isExecutingQuery,
		executeQueryError: executeQueryErrorNormal,
	} = useExecuteQuery("normal");
	const {
		executeQuery: executeQuerySandbox,
		isExecutingQuery: isExecutingSandbox,
		executeQueryError: executeQueryErrorSandbox,
	} = useExecuteQuery("sandbox");
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const [currentQuery, setCurrentQuery] = useState<string>("");
	const [lastRunMode, setLastRunMode] = useState<"normal" | "sandbox">("normal");
	const [lastExecutedQuery, setLastExecutedQuery] = useState<string>("");
	const [optimizationResult, setOptimizationResult] = useState<{
		currentTimeMs: number;
		suggestedTimeMs: number;
		suggestedQuery: string;
		explanation: string;
	} | null>(null);
	const { analyzeQuery, isAnalyzing, analyzeError } = useAnalyzeQuery();
	const {
		suggestOptimization,
		isSuggestingOptimization,
		suggestOptimizationError,
	} = useSuggestOptimization();
	const { setPendingSql } = useInsertSqlStore();

	const getInitialQuery = useCallback(() => {
		if (!query) return PGSQL_PLACEHOLDER_QUERY;
		return query?.query ?? PGSQL_PLACEHOLDER_QUERY;
	}, [query]);

	// Execute query function
	const handleExecuteQuery = useCallback(
		async (query: string, mode: "normal" | "sandbox" = "normal") => {
			if (!query.trim()) {
				toast.error("Query is empty!");
				return;
			}

			const runner = mode === "sandbox" ? executeQuerySandbox : executeQuery;
			setLastRunMode(mode);
			setLastExecutedQuery(query);
			runner({ query }).then((result) => {
				setQueryResult({ data: result, queryId: queryId ?? "" });
			});
		},
		[executeQuery, executeQuerySandbox, queryId],
	);

	// Handler for button click
	const handleButtonClick = useCallback(() => {
		if (!currentQuery.trim()) {
			toast.error("Query is empty!");
			return;
		}

		handleExecuteQuery(currentQuery, "normal");
	}, [handleExecuteQuery, currentQuery]);

	const handleSandboxRun = useCallback(() => {
		if (!currentQuery.trim()) {
			toast.error("Query is empty!");
			return;
		}

		handleExecuteQuery(currentQuery, "sandbox");
	}, [handleExecuteQuery, currentQuery]);

	// Button handlers
	const handleFavorite = useCallback(() => {
		if (!queryId) return;
		toggleFavorite(queryId);
		toast.success(isFavorite ? "Query unfavorited" : "Query favorited");
	}, [toggleFavorite, queryId, isFavorite]);

	const handleFormatQuery = useCallback(() => {
		// This will be passed to Monaco component
	}, []);

	const handleSaveQuery = useCallback(() => {
		if (!currentQuery) return;

		// if no queryId, create a new query
		if (!queryId) {
			const newQueryId = addQuery();
			updateQuery(newQueryId, { query: currentQuery });
			navigate({
				to: "/runner/$queryId",
				params: { queryId: newQueryId },
			});
		} else {
			updateQuery(queryId, { query: currentQuery });
		}
		setHasUnsavedChanges(false);
		toast.success("Query saved");
	}, [currentQuery, queryId, updateQuery, addQuery, navigate]);

	const handleOptimizeQuery = useCallback(async () => {
		if (!currentQuery.trim()) {
			toast.error("Query is empty!");
			return;
		}

		setOptimizationResult(null);
		const currentAnalysis = await analyzeQuery({ query: currentQuery });
		const optimization = await suggestOptimization({ query: currentQuery });
		const suggestedAnalysis = await analyzeQuery({ query: optimization.suggestedQuery });

		setOptimizationResult({
			currentTimeMs: currentAnalysis.executionTimeMs,
			suggestedTimeMs: suggestedAnalysis.executionTimeMs,
			suggestedQuery: optimization.suggestedQuery,
			explanation: optimization.explanation,
		});
	}, [currentQuery, analyzeQuery, suggestOptimization]);

	return (
		<div className="flex-1 relative w-full flex flex-col">
			<RunnerHeader
				isExecutingQuery={isExecutingQuery || isExecutingSandbox}
				handleButtonClick={handleButtonClick}
				handleSandboxRun={handleSandboxRun}
				handleOptimizeQuery={handleOptimizeQuery}
				isOptimizing={isAnalyzing || isSuggestingOptimization}
				handleFormatQuery={handleFormatQuery}
				handleSaveQuery={handleSaveQuery}
				handleFavorite={handleFavorite}
				isFavorite={isFavorite}
				queryId={queryId ?? ""}
				hasUnsavedChanges={hasUnsavedChanges}
				queryResult={queryResult ?? null}
				lastRunMode={lastRunMode}
			/>

			{(optimizationResult || analyzeError || suggestOptimizationError) && (
				<div className="border-b border-zinc-800 bg-black/60 px-3 py-2 text-xs space-y-2">
					{optimizationResult && (
						<div className="flex flex-col gap-2">
							<div className="text-muted-foreground">
								Estimated run time:{" "}
								<span className="text-foreground">
									{optimizationResult.currentTimeMs.toFixed(2)}ms
								</span>{" "}
								→{" "}
								<span className="text-foreground">
									{optimizationResult.suggestedTimeMs.toFixed(2)}ms
								</span>
							</div>
							<div className="text-muted-foreground">{optimizationResult.explanation}</div>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={() => setPendingSql(optimizationResult.suggestedQuery)}
								>
									Insert optimized query
								</Button>
							</div>
						</div>
					)}
					{analyzeError && (
						<div className="text-destructive">Analyze error: {analyzeError.message}</div>
					)}
					{suggestOptimizationError && (
						<div className="text-destructive">
							Optimization error: {suggestOptimizationError.message}
						</div>
					)}
				</div>
			)}

			<Suspense fallback={<div className="flex-1 bg-[#1E1E1E] size-full" />}>
				<CodeEditor
					initialQuery={getInitialQuery()}
					queryId={queryId}
					savedQuery={query?.query ?? ""}
					onQueryChange={setCurrentQuery}
					onUnsavedChanges={setHasUnsavedChanges}
					onExecuteQuery={handleExecuteQuery}
					onFormatQuery={handleFormatQuery}
					onSaveQuery={handleSaveQuery}
				/>
			</Suspense>

			<QueryResultContainer
				results={queryResult?.data ?? null}
				isLoading={isExecutingQuery || isExecutingSandbox}
				error={
					lastRunMode === "sandbox"
						? executeQueryErrorSandbox
						: executeQueryErrorNormal
				}
				runMode={lastRunMode}
				lastExecutedQuery={lastExecutedQuery}
			/>
		</div>
	);
};
