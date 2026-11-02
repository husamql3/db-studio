import JsonView from "@uiw/react-json-view";
import { githubLightTheme } from "@uiw/react-json-view/githubLight";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import type { CSSProperties } from "react";
import { TableFooter } from "@/features/tables/components/table-footer";
import { useTheme } from "@/hooks/use-theme";

/**
 * Extracts a human-readable string from a document's `_id` field for display
 * in the card header. Handles plain scalars, BSON extended-JSON ObjectIds
 * (`{ $oid: "..." }`), and arbitrary objects via JSON serialization.
 */
const getDocumentIdLabel = (doc: Record<string, unknown>): string => {
	const id = doc._id;
	if (id === null || id === undefined) return "";
	if (typeof id === "string" || typeof id === "number" || typeof id === "boolean") {
		return String(id);
	}
	if (typeof id === "object") {
		// MongoDB BSON ObjectId serialized as extended JSON
		const oid = (id as Record<string, unknown>).$oid;
		if (typeof oid === "string") return oid;
		return JSON.stringify(id);
	}
	return String(id);
};

/**
 * A single MongoDB document rendered as a bordered card, mirroring the
 * Compass document list view. The header shows the 1-based document number
 * and its `_id` value; the body is an independently collapsible JsonView tree.
 */
const DocumentCard = ({
	doc,
	index,
	jsonTheme,
}: {
	doc: Record<string, unknown>;
	index: number;
	/** Resolved JsonView theme object (vscode dark or GitHub light). */
	jsonTheme: CSSProperties;
}) => {
	const idLabel = getDocumentIdLabel(doc);

	return (
		<div className="border border-border rounded-md overflow-hidden">
			{/* Card header — document number (1-based) and its _id for quick orientation */}
			<div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border select-none">
				<span className="text-xs font-mono font-medium text-muted-foreground">
					{index + 1}
				</span>
				{idLabel && (
					<>
						<span
							className="text-xs text-muted-foreground/50"
							aria-hidden="true"
						>
							·
						</span>
						<span
							className="text-xs font-mono text-foreground truncate"
							title={idLabel}
						>
							{idLabel}
						</span>
					</>
				)}
			</div>

			{/* Document body — each card gets its own JsonView so trees are independently collapsible */}
			<div className="p-3">
				<JsonView
					value={doc}
					objectSortKeys={false}
					displayObjectSize={true}
					displayDataTypes={false}
					indentWidth={14}
					collapsed={2}
					shortenTextAfterLength={120}
					highlightUpdates={false}
					style={jsonTheme}
					enableClipboard={true}
				/>
			</div>
		</div>
	);
};

export const TableDocumentView = ({
	tableName,
	rows,
}: {
	tableName: string;
	rows: Record<string, unknown>[];
}) => {
	const { isDark } = useTheme();
	const jsonTheme = isDark ? vscodeTheme : githubLightTheme;

	return (
		<div className="flex-1 w-full flex flex-col overflow-hidden pb-9">
			<div className="flex-1 overflow-auto bg-background p-3">
				{/* Each document is its own card — mirrors the Compass document list view */}
				<div className="flex flex-col gap-2">
					{rows.map((doc, index) => (
						<DocumentCard
							// ObjectId _id serializes to a unique string; fall back to index
							key={getDocumentIdLabel(doc) || index}
							doc={doc}
							index={index}
							jsonTheme={jsonTheme}
						/>
					))}
				</div>
			</div>
			<TableFooter
				tableName={tableName}
				variant="document"
			/>
		</div>
	);
};
