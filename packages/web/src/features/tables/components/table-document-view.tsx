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
 * Builds a stable, type-preserving React key for a document card.
 *
 * `getDocumentIdLabel` maps both `_id: 1` (number) and `_id: "1"` (string) to
 * the same string `"1"`, which would cause React to treat them as the same node.
 * Prefixing with the JS type prevents that collision. When `_id` is absent the
 * key falls back to `"idx:<index>"` so it never conflicts with an id-derived key.
 */
const getDocumentKey = (doc: Record<string, unknown>, index: number): string => {
	const id = doc._id;
	if (id === null || id === undefined) return `idx:${index}`;
	if (typeof id === "string") return `str:${id}`;
	if (typeof id === "number") return `num:${id}`;
	if (typeof id === "boolean") return `bool:${id}`;
	if (typeof id === "object") {
		const oid = (id as Record<string, unknown>).$oid;
		if (typeof oid === "string") return `oid:${oid}`;
		return `obj:${JSON.stringify(id)}`;
	}
	return `idx:${index}`;
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

			{/* Document body — overflow-x-auto lets wide content scroll rather than clip behind the card edge */}
			<div className="p-3 overflow-x-auto">
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
							key={getDocumentKey(doc, index)}
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
