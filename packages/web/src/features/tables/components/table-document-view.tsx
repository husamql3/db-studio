import JsonView from "@uiw/react-json-view";
import { ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";
import { CellCopyButton } from "@/features/tables/components/cell-copy-button";
import { TableFooter } from "@/features/tables/components/table-footer";
import { useTheme } from "@/hooks/use-theme";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

/**
 * Colors from Monaco's built-in `vs-dark` / `vs` JSON token rules, which the db-studio Monaco
 * themes inherit, so documents read like the JSON editors. Backgrounds stay transparent, as in
 * those themes, and inherit the app surface.
 */
const monacoJsonTheme = (colors: {
	foreground: string;
	key: string;
	string: string;
	number: string;
	keyword: string;
	delimiter: string;
	indentGuide: string;
}): CSSProperties & Record<`--w-rjv-${string}`, string> => ({
	// Monaco's default font stacks for macOS, Windows and Linux.
	"--w-rjv-font-family": `Menlo, Monaco, Consolas, "Droid Sans Mono", "Courier New", monospace`,
	"--w-rjv-background-color": "transparent",
	"--w-rjv-color": colors.foreground,
	"--w-rjv-key-string": colors.key,
	"--w-rjv-key-number": "var(--muted-foreground)",
	"--w-rjv-quotes-color": colors.key,
	"--w-rjv-quotes-string-color": colors.string,
	"--w-rjv-type-string-color": colors.string,
	"--w-rjv-type-url-color": colors.string,
	"--w-rjv-type-int-color": colors.number,
	"--w-rjv-type-float-color": colors.number,
	"--w-rjv-type-bigint-color": colors.number,
	"--w-rjv-type-nan-color": colors.number,
	"--w-rjv-type-date-color": colors.number,
	"--w-rjv-type-boolean-color": colors.keyword,
	"--w-rjv-type-null-color": colors.keyword,
	"--w-rjv-type-undefined-color": colors.keyword,
	"--w-rjv-curlybraces-color": colors.delimiter,
	"--w-rjv-brackets-color": colors.delimiter,
	"--w-rjv-colon-color": colors.delimiter,
	"--w-rjv-ellipsis-color": "var(--muted-foreground)",
	"--w-rjv-info-color": "var(--muted-foreground)",
	"--w-rjv-copied-color": "var(--muted-foreground)",
	"--w-rjv-line-color": colors.indentGuide,
});

const MONACO_JSON_DARK = monacoJsonTheme({
	foreground: "#D4D4D4",
	key: "#9CDCFE",
	string: "#CE9178",
	number: "#B5CEA8",
	keyword: "#CE9178",
	delimiter: "#DCDCDC",
	indentGuide: "#404040",
});

const MONACO_JSON_LIGHT = monacoJsonTheme({
	foreground: "#000000",
	key: "#A31515",
	string: "#0451A5",
	number: "#098658",
	keyword: "#0451A5",
	delimiter: "#000000",
	indentGuide: "#D3D3D3",
});

const INHERIT_TEXT: CSSProperties = { fontSize: "inherit", lineHeight: "inherit" };

const getIdColor = (id: unknown) => {
	if (id === null) return "var(--w-rjv-type-null-color)";

	if (typeof id === "string") return "var(--w-rjv-type-string-color)";

	if (typeof id === "number") return "var(--w-rjv-type-int-color)";

	if (typeof id === "boolean") return "var(--w-rjv-type-boolean-color)";

	return "var(--w-rjv-color)";
};

/**
 * Monaco-style fold chevron as a real button, so nested nodes toggle from the keyboard. The
 * click bubbles to the library's row handler, which owns the expansion state.
 */
const FoldButton = (
	<JsonView.Arrow
		render={({ style }, { keyName }) => (
			<button
				type="button"
				// The library rotates the arrow -90deg while a node is folded; it exposes no other state.
				aria-expanded={style?.transform !== "rotate(-90deg)"}
				aria-label={keyName === undefined ? "Toggle document" : `Toggle ${keyName}`}
				className="mr-0.5 inline-flex size-[1em] cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				<ChevronDown
					className="size-[0.9em]"
					style={{ transform: style?.transform }}
				/>
			</button>
		)}
	/>
);

const DocumentCard = ({
	doc,
	indentWidth,
}: {
	doc: Record<string, unknown>;
	indentWidth: number;
}) => {
	// JSON.stringify keeps null, "", 0 and false visible and quotes strings like the body does.
	const idLabel = "_id" in doc ? JSON.stringify(doc._id) : "missing";

	return (
		<li className="overflow-hidden rounded-md border border-border">
			<div className="group flex min-h-8 items-center gap-2 border-b border-border bg-muted/40 px-3 py-1">
				<span className="shrink-0 select-none font-sans text-xs text-muted-foreground">
					_id
				</span>
				<span
					className="min-w-0 truncate"
					style={{ color: "_id" in doc ? getIdColor(doc._id) : "var(--muted-foreground)" }}
					title={idLabel}
				>
					{idLabel}
				</span>
				<CellCopyButton
					// The copy button hides empty values; copy null and "" as the header shows them.
					value={doc._id === null || doc._id === "" ? idLabel : doc._id}
					className="static shrink-0 translate-y-0"
				/>
			</div>
			<div className="overflow-x-auto px-3 py-2">
				<JsonView
					value={doc}
					style={INHERIT_TEXT}
					objectSortKeys={false}
					displayObjectSize={true}
					displayDataTypes={false}
					indentWidth={indentWidth}
					collapsed={2}
					shortenTextAfterLength={120}
					highlightUpdates={false}
					enableClipboard={true}
				>
					{FoldButton}
				</JsonView>
			</div>
		</li>
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
	const { editor } = usePersonalPreferencesStore();
	// Monaco indents by tab size in characters; its monospace fonts advance about 0.6em.
	const indentWidth = Math.round(editor.tabSize * editor.fontSize * 0.6);

	return (
		<div className="flex-1 w-full flex flex-col overflow-hidden pb-9">
			<div className="flex-1 overflow-auto bg-background p-3">
				<ul
					aria-label={`${tableName} documents`}
					className="flex flex-col gap-2"
					style={{
						...(isDark ? MONACO_JSON_DARK : MONACO_JSON_LIGHT),
						fontFamily: "var(--w-rjv-font-family)",
						fontSize: editor.fontSize,
						lineHeight: 1.5,
					}}
				>
					{rows.map((doc, index) => (
						<DocumentCard
							// The adapter sends ObjectIds as hex strings, so an ObjectId and a string _id
							// can match; the position keeps keys unique within the page.
							key={`${index}:${JSON.stringify(doc._id)}`}
							doc={doc}
							indentWidth={indentWidth}
						/>
					))}
				</ul>
			</div>
			<TableFooter
				tableName={tableName}
				variant="document"
			/>
		</div>
	);
};
