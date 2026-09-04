import type { ExecuteQueryResult } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import { Spinner } from "@db-studio/ui/spinner";
import JsonView from "@uiw/react-json-view";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import { useQueryState } from "nuqs";
import { useMemo } from "react";
import { useAssistantRequestStore } from "@/features/ai-assistant";
import { useOverlayStore } from "@/stores/overlay.store";
import { CONSTANTS } from "@/utils/constants";
import { TableView } from "./table-view";

export const QueryResultContainer = ({
	results,
	isLoading,
	error,
	lastExecutedQuery,
}: {
	results: ExecuteQueryResult | null;
	isLoading: boolean;
	error: Error | null;
	lastExecutedQuery: string;
}) => {
	const [showAs] = useQueryState(CONSTANTS.RUNNER_STATE_KEYS.SHOW_AS);
	const { requestAssistant } = useAssistantRequestStore();
	const { openOverlay } = useOverlayStore();
	const askAssistant = (prompt: string) => {
		requestAssistant(prompt);
		openOverlay("chat.assistant");
	};

	const renderResults = useMemo(() => {
		if (error) {
			return (
				<div className="flex h-full p-2">
					<div className="space-y-2 text-sm">
						<div>Error: {error.message}</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={!lastExecutedQuery.trim()}
							onClick={() =>
								askAssistant(
									`Fix this failing query. Explain the cause and return the complete corrected query in a fenced code block.\n\nQuery:\n${lastExecutedQuery}\n\nError:\n${error.message}`,
								)
							}
						>
							Suggest fix
						</Button>
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
	}, [showAs, results, error, lastExecutedQuery]);

	return (
		<div
			className="absolute bottom-0 left-0 right-0 border-t-2 border-zinc-80 flex flex-col bg-[#1E1E1E] w-full"
			style={{ height: "calc(100vh - 400px)" }}
		>
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
