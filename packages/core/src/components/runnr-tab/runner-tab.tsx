import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useState } from "react";
import type { ExecuteQueryResponse } from "shared/types";
import { toast } from "sonner";
import { QueryResultContainer } from "@/components/runnr-tab/query-result-container";
import { RunnerHeader } from "@/components/runnr-tab/runner-header";
import { useExecuteQuery } from "@/hooks/use-execute-query";
import { useQueriesStore } from "@/stores/queries.store";
import { PGSQL_PLACEHOLDER_QUERY } from "@/utils/constants/placeholders";

const CodeEditor = lazy(() =>
	import("@/components/runnr-tab/cdoe-editor").then((module) => ({
		default: module.CodeEditor,
	})),
);

export type QueryResult = {
	data: ExecuteQueryResponse;
	queryId: string;
};

export const RunnerTab = ({ queryId }: { queryId?: string }) => {
	const navigate = useNavigate();
	const [queryResult, setQueryResult] = useState<QueryResult | undefined>(undefined);
	const { getQuery, updateQuery, toggleFavorite, addQuery } = useQueriesStore();
	const query = queryId ? getQuery(queryId) : null;
	const isFavorite = query?.isFavorite ?? false;
	const { executeQuery, isExecutingQuery, executeQueryError } = useExecuteQuery();
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const [currentQuery, setCurrentQuery] = useState<string>("");

	const getInitialQuery = useCallback(() => {
		if (!query) return PGSQL_PLACEHOLDER_QUERY;
		return query?.query ?? PGSQL_PLACEHOLDER_QUERY;
	}, [query]);

	// Execute query function
	const handleExecuteQuery = useCallback(
		async (query: string) => {
			if (!query.trim()) {
				toast.error("Query is empty!");
				return;
			}

			executeQuery({ query }).then((result) => {
				setQueryResult({ data: result, queryId: queryId ?? "" });
			});
		},
		[executeQuery, queryId],
	);

	// Handler for button click
	const handleButtonClick = useCallback(() => {
		if (!currentQuery.trim()) {
			toast.error("Query is empty!");
			return;
		}

		handleExecuteQuery(currentQuery);
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

	return (
		<div className="flex-1 relative w-full flex flex-col">
			<RunnerHeader
				isExecutingQuery={isExecutingQuery}
				handleButtonClick={handleButtonClick}
				handleFormatQuery={handleFormatQuery}
				handleSaveQuery={handleSaveQuery}
				handleFavorite={handleFavorite}
				isFavorite={isFavorite}
				queryId={queryId ?? ""}
				hasUnsavedChanges={hasUnsavedChanges}
				queryResult={queryResult ?? null}
			/>

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
				isLoading={isExecutingQuery}
				error={executeQueryError}
			/>
		</div>
	);
};
