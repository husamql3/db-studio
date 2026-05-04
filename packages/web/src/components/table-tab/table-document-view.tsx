import JsonView from "@uiw/react-json-view";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import { TableFooter } from "@/components/table-tab/table-footer";

export const TableDocumentView = ({
	tableName,
	rows,
}: {
	tableName: string;
	rows: Record<string, unknown>[];
}) => (
	<div className="flex-1 w-full flex flex-col overflow-hidden pb-9">
		<div className="flex-1 overflow-auto bg-[#1E1E1E] p-3">
			<JsonView
				value={rows}
				objectSortKeys={true}
				displayObjectSize={false}
				displayDataTypes={false}
				indentWidth={14}
				collapsed={1}
				shortenTextAfterLength={120}
				highlightUpdates={false}
				style={vscodeTheme}
				enableClipboard={false}
				className="size-full"
			/>
		</div>
		<TableFooter tableName={tableName} />
	</div>
);
