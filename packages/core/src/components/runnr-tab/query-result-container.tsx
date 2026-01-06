import JsonView from "@uiw/react-json-view";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import { useQueryState } from "nuqs";
import { useMemo } from "react";
import type { ExecuteQueryResponse } from "server/src/dao/query.dao";
import { QueryResultWrapper } from "@/components/runnr-tab/query-result-wrapper";
import { CONSTANTS } from "@/utils/constants";
import { TableView } from "./table-view";

export const QueryResultContainer = ({
	results,
	isLoading,
}: {
	results: ExecuteQueryResponse | null;
	isLoading: boolean;
}) => {
	const [showAs] = useQueryState(CONSTANTS.RUNNER_STATE_KEYS.SHOW_AS);

	const renderResults = useMemo(() => {
		if (results?.error) {
			return (
				<div className="flex items-center justify-center h-full">
					<div className="text-red-500 text-sm">Error: {results.error}</div>
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

	if (!results) return null;

	return <QueryResultWrapper isLoading={isLoading}>{renderResults}</QueryResultWrapper>;
};
