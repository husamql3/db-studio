import JsonView from "@uiw/react-json-view";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import type { ExecuteQueryResponse } from "server/src/dao/query.dao";
import { toast } from "sonner";
import { QueryResultWrapper } from "@/components/runnr-tab/query-result-wrapper";

export const QueryResultContainer = ({
	results,
}: {
	results: ExecuteQueryResponse | null;
}) => {
	return (
		<QueryResultWrapper>
			<JsonView
				value={results || []}
				objectSortKeys={true}
				enableClipboard={true}
				displayObjectSize={true}
				displayDataTypes={true}
				indentWidth={14}
				collapsed={2}
				shortenTextAfterLength={100}
				highlightUpdates={false}
				style={vscodeTheme}
				onCopied={() => {
					toast.success("Copied to clipboard");
				}}
				beforeCopy={(copyText) => {
					// Format JSON with proper indentation before copying
					try {
						const parsed = JSON.parse(copyText);
						return JSON.stringify(parsed, null, 2);
					} catch {
						return copyText;
					}
				}}
				className="size-full"
			/>
		</QueryResultWrapper>
	);
};
