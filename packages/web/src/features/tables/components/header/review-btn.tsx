import { Button } from "@db-studio/ui/button";
import { Kbd } from "@db-studio/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@db-studio/ui/popover";
import { ArrowRight, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatCellValue } from "@/utils/format-cell-value";
import { useUpdateCell } from "../../hooks/use-update-cell";
import {
	type CellUpdate,
	getRowIdentity,
	useUpdateCellStore,
} from "../../stores/update-cell.store";
import { stableStringify } from "../../utils/table-diff";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const CellValue = ({ value, className }: { value: unknown; className: string }) => {
	const text = formatCellValue(value);
	return (
		<span
			className={`min-w-0 flex-1 truncate font-mono ${className}`}
			title={text}
		>
			{value === null || value === undefined ? (
				<span className="italic">NULL</span>
			) : (
				text || <span className="italic">empty</span>
			)}
		</span>
	);
};

/** The pending edits of the open table, by row, each cell revertible; ⌘Z/Ctrl+Z undoes. */
export const ReviewBtn = () => {
	const { getUpdates, clearUpdate, undo } = useUpdateCellStore();
	const { isUpdatingCell, editScope } = useUpdateCell();
	const [isOpen, setIsOpen] = useState(false);
	const updates = getUpdates(editScope.id);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.key.toLowerCase() !== "z" ||
				!(event.metaKey || event.ctrlKey) ||
				event.shiftKey ||
				event.altKey ||
				isUpdatingCell
			) {
				return;
			}
			// Text fields and editors keep their own undo.
			if (
				event.target instanceof Element &&
				event.target.closest("input, textarea, select, [contenteditable='true']")
			) {
				return;
			}
			const count = undo(editScope.id);
			if (count === 0) return;
			event.preventDefault();
			toast(`Undid ${count} ${count === 1 ? "change" : "changes"}`);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [undo, editScope.id, isUpdatingCell]);

	if (updates.length === 0) return null;

	const rows = new Map<string, CellUpdate[]>();
	for (const update of updates) {
		const key = stableStringify(getRowIdentity(update.rowData, editScope));
		rows.set(key, [...(rows.get(key) ?? []), update]);
	}

	const rowLabel = (rowData: Record<string, unknown>, index: number) => {
		const keys =
			editScope.keyColumns.length > 0
				? editScope.keyColumns
				: ["id", "_id"].filter((column) => column in rowData).slice(0, 1);
		return keys.length > 0
			? keys.map((column) => `${column} = ${formatCellValue(rowData[column])}`).join(", ")
			: `Row ${index + 1}`;
	};

	return (
		<Popover
			open={isOpen}
			onOpenChange={setIsOpen}
		>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className="h-8! border-l-0 border-y-0 border-r border-border rounded-none"
					aria-label="Review unsaved changes"
				>
					Review
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[28rem] p-0"
			>
				<div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
					<span>
						{updates.length} {updates.length === 1 ? "change" : "changes"} in {rows.size}{" "}
						{rows.size === 1 ? "row" : "rows"}
					</span>
					<span className="flex items-center gap-1">
						<Kbd className="text-xs font-normal">{isMac ? "⌘Z" : "Ctrl+Z"}</Kbd> undo
					</span>
				</div>
				<div className="max-h-96 overflow-auto">
					{[...rows.values()].map((cells, index) => (
						<section key={stableStringify(getRowIdentity(cells[0].rowData, editScope))}>
							<h3 className="sticky top-0 border-b bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">
								{rowLabel(cells[0].rowData, index)}
							</h3>
							<ul>
								{cells.map((cell) => (
									<li
										key={cell.columnName}
										className="flex items-center gap-2 border-b px-3 py-1 text-xs last:border-b-0"
									>
										<span
											className="w-28 shrink-0 truncate"
											title={cell.columnName}
										>
											{cell.columnName}
										</span>
										<CellValue
											value={cell.originalValue}
											className="text-muted-foreground line-through"
										/>
										<ArrowRight className="size-3 shrink-0 text-muted-foreground" />
										<CellValue
											value={cell.newValue}
											className="text-green-600 dark:text-green-400"
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-6 shrink-0"
											onClick={() => clearUpdate(cell.rowData, cell.columnName, editScope)}
											disabled={isUpdatingCell}
											aria-label={`Revert ${cell.columnName}`}
											title="Revert to the original value"
										>
											<Undo2 className="size-3.5" />
										</Button>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
};
