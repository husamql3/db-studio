import JsonView from "@uiw/react-json-view";
import { githubLightTheme } from "@uiw/react-json-view/githubLight";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import { TableFooter } from "@/features/tables/components/table-footer";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const TableDocumentView = ({
	tableName,
	rows,
}: {
	tableName: string;
	rows: Record<string, unknown>[];
}) => {
	const theme = usePersonalPreferencesStore((state) => state.theme);
	const isDark =
		theme === "dark" ||
		(theme === "system" &&
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);

	return (
		<div className="flex-1 w-full flex flex-col overflow-hidden pb-9">
			<div className="flex-1 overflow-auto bg-background p-3">
				<JsonView
					value={rows}
					keyName={tableName}
					objectSortKeys={false}
					displayObjectSize={true}
					displayDataTypes={false}
					indentWidth={14}
					collapsed={1}
					shortenTextAfterLength={120}
					highlightUpdates={false}
					style={isDark ? vscodeTheme : githubLightTheme}
					enableClipboard={true}
					className="size-full"
				/>
			</div>
			<TableFooter
				tableName={tableName}
				variant="document"
			/>
		</div>
	);
};
