import type { ExecuteQueryResult } from "@db-studio/shared/types";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useState } from "react";
import { toast } from "sonner";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { useQueriesStore } from "@/stores/queries.store";
import { PLACEHOLDER_QUERIES } from "@/utils/constants/placeholders";
import { QueryResultContainer } from "../components/query-result-container";
import { RunnerHeader } from "../components/runner-header";
import { useExecuteQuery } from "../hooks/use-execute-query";

const CodeEditor = lazy(() =>
	import("../components/code-editor").then((module) => ({
		default: module.CodeEditor,
	})),
);

export type QueryResult = {
	data: ExecuteQueryResult;
	queryId: string;
};

export const RunnerScreen = ({
	queryId,
	initialQuery,
}: {
	queryId?: string;
	initialQuery?: string;
}) => {
	const navigate = useNavigate();
	const [queryResult, setQueryResult] = useState<QueryResult | undefined>(undefined);
	const { getQuery, updateQuery, toggleFavorite, addQuery } = useQueriesStore();
	const query = queryId ? getQuery(queryId) : null;
	const isFavorite = query?.isFavorite ?? false;
	const { executeQuery, isExecutingQuery, executeQueryError } = useExecuteQuery();
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const [currentQuery, setCurrentQuery] = useState<string>("");
	const [lastExecutedQuery, setLastExecutedQuery] = useState("");
	const engine = useDatabaseEngine();
	const editorLanguage = engine?.editorLanguage ?? "pgsql";
	const isKeyValue = engine?.dataModel === "key-value";

	const getInitialQuery = useCallback(() => {
		if (initialQuery) return initialQuery;
		const placeholder = PLACEHOLDER_QUERIES[editorLanguage];
		if (!query) return placeholder;
		return query?.query ?? placeholder;
	}, [query, editorLanguage, initialQuery]);

	const handleExecuteQuery = useCallback(
		async (query: string) => {
			if (!query.trim()) {
				toast.error("Query is empty!");
				return;
			}
			const command = query.trim().match(/^\S+/)?.[0]?.toUpperCase();
			if (isKeyValue && (command === "FLUSHDB" || command === "FLUSHALL")) {
				const confirmation = window.prompt(
					`This permanently deletes Redis data. Type ${command} to continue.`,
				);
				if (confirmation !== command) return;
			}
			setLastExecutedQuery(query);

			const result = await executeQuery({ query });
			if (result) {
				setQueryResult({ data: result, queryId: queryId ?? "" });
			}
		},
		[isKeyValue, executeQuery, queryId],
	);

	const handleButtonClick = useCallback(() => {
		if (!currentQuery.trim()) {
			toast.error("Query is empty!");
			return;
		}

		handleExecuteQuery(currentQuery);
	}, [handleExecuteQuery, currentQuery]);

	const handleFavorite = useCallback(() => {
		if (!queryId) return;
		toggleFavorite(queryId);
		toast.success(isFavorite ? "Query unfavorited" : "Query favorited");
	}, [toggleFavorite, queryId, isFavorite]);

	const handleFormatQuery = useCallback(() => {
		// passed to Monaco component
	}, []);

	const handleSaveQuery = useCallback(() => {
		if (!currentQuery) return;

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
				currentQuery={currentQuery}
			/>

			<Suspense fallback={<div className="flex-1 bg-background size-full" />}>
				<CodeEditor
					initialQuery={getInitialQuery()}
					queryId={queryId}
					savedQuery={query?.query ?? ""}
					language={editorLanguage}
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
				lastExecutedQuery={lastExecutedQuery}
			/>
		</div>
	);
};
