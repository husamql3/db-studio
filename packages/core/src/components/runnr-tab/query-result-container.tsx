import JsonView from "@uiw/react-json-view";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import { useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import type { ExecuteQueryResult, SuggestFixResult } from "shared/types";
import { TableView } from "@/components/runnr-tab/table-view";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSuggestFix } from "@/hooks/use-suggest-fix";
import { useInsertSqlStore } from "@/stores/insert-sql.store";
import { CONSTANTS } from "@/utils/constants";

export const QueryResultContainer = ({
	results,
	isLoading,
	error,
	runMode,
	lastExecutedQuery,
}: {
	results: ExecuteQueryResult | null;
	isLoading: boolean;
	error: Error | null;
	runMode: "normal" | "sandbox";
	lastExecutedQuery: string;
}) => {
	const [showAs] = useQueryState(CONSTANTS.RUNNER_STATE_KEYS.SHOW_AS);
	const { suggestFix, isSuggestingFix, suggestFixError } = useSuggestFix();
	const { setPendingSql } = useInsertSqlStore();
	const [fixResult, setFixResult] = useState<SuggestFixResult | null>(null);

	useEffect(() => {
		setFixResult(null);
	}, [error]);

	const renderResults = useMemo(() => {
		if (error) {
			const errorDetails = (error as Error & { details?: unknown }).details;
			return (
				<div className="flex h-full p-2">
					<div className="text-sm space-y-2">
						<div>Error: {error.message}</div>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={!lastExecutedQuery || isSuggestingFix}
								onClick={() => {
									setFixResult(null);
									suggestFix({
										query: lastExecutedQuery,
										errorMessage: error.message,
										errorDetails,
									}).then((result) => setFixResult(result));
								}}
							>
								{isSuggestingFix ? "Suggesting..." : "Suggest fix"}
							</Button>
							{suggestFixError && (
								<span className="text-xs text-destructive">
									{suggestFixError.message}
								</span>
							)}
						</div>
						{fixResult && (
							<div className="rounded-md border border-zinc-800 p-2 space-y-2">
								<div className="text-xs text-muted-foreground">
									{fixResult.explanation}
								</div>
								<pre className="text-xs whitespace-pre-wrap">{fixResult.suggestedQuery}</pre>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={() => setPendingSql(fixResult.suggestedQuery)}
								>
									Insert into editor
								</Button>
							</div>
						)}
					</div>
				</div>
			);
		}

		if (results?.message) {
			return (
				<div className="flex h-full p-2">
					<p>{results.message}</p>
				</div>
			);
		}

		if (!results || results.rows.length === 0) {
			return (
				<div className="flex h-full p-2">
					<p>Run the query to see the results</p>
				</div>
			);
		}

		if (showAs === "json") {
			return (
				<div className="p-2">
					<JsonView
						value={results?.rows ?? []}
						objectSortKeys={true}
						displayObjectSize={false}
						displayDataTypes={false}
						indentWidth={14}
						collapsed={2}
						shortenTextAfterLength={100}
						highlightUpdates={false}
						style={vscodeTheme}
						enableClipboard={false}
						className="size-full"
					/>
				</div>
			);
		}

		return <TableView results={results} />;
	}, [showAs, results, error]);

	return (
		<div
			className="absolute bottom-0 left-0 right-0 border-t-2 border-zinc-80 flex flex-col bg-[#1E1E1E] w-full"
			style={{ height: "calc(100vh - 400px)" }}
		>
			{runMode === "sandbox" && (
				<div className="px-2 py-1 text-xs text-amber-400 border-b border-zinc-800">
					Sandbox run — no changes saved
				</div>
			)}
			<div className="flex-1 overflow-auto w-full">
				{isLoading ? (
					<div className="flex items-center justify-center h-full overflow-auto">
						<Spinner
							size="size-8"
							color="bg-[#d4d4d4]"
						/>
					</div>
				) : (
					renderResults
				)}
			</div>
		</div>
	);
};
