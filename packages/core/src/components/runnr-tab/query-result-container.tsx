import JsonView from "@uiw/react-json-view";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import { useQueryState } from "nuqs";
import { useMemo } from "react";
import type { ExecuteQueryResponse } from "server/src/dao/query.dao";
import { TableView } from "@/components/runnr-tab/table-view";
import { Spinner } from "@/components/ui/spinner";
import { CONSTANTS } from "@/utils/constants";

export const QueryResultContainer = ({
	results,
	isLoading,
}: {
	results: ExecuteQueryResponse | null;
	isLoading: boolean;
}) => {
	const [showAs] = useQueryState(CONSTANTS.RUNNER_STATE_KEYS.SHOW_AS);

	const renderResults = useMemo(() => {
		if (!results || results.rowCount === 0) {
			return (
				<div className="flex h-full p-2">
					<p>Run the query to see the results</p>
				</div>
			);
		}

		if (results?.error) {
			return (
				<div className="flexh-full p-2">
					<div className="text-sm">Error: {results.error}</div>
				</div>
			);
		}

		if (showAs === "json") {
			return (
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
			);
		}

		return <TableView results={results} />;
	}, [showAs, results]);

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
