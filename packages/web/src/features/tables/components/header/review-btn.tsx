import { Button } from "@db-studio/ui/button";
import { Kbd } from "@db-studio/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@db-studio/ui/popover";
import { cn } from "@db-studio/ui/utils";
import { Undo2 } from "lucide-react";
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

/** One side of a change, like a diff line; NULL and empty text get the grid's markers. */
const DiffLine = ({ value, added }: { value: unknown; added: boolean }) => {
	const text = formatCellValue(value);
	const marker = value === null || value === undefined ? "NULL" : text === "" ? "EMPTY" : null;
	const Line = added ? "ins" : "del";
	return (
		<Line
			className={cn(
				"flex min-w-0 gap-1.5 px-1.5 no-underline",
				added
					? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
					: "bg-red-500/10 text-red-700 dark:text-red-300",
			)}
			title={marker ?? text}
		>
			<span
				aria-hidden
				className="select-none opacity-60"
			>
				{added ? "+" : "-"}
			</span>
			<span className={cn("truncate", marker && "text-[0.625rem]")}>{marker ?? text}</span>
		</Line>
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
				className="w-[28rem] gap-0 overflow-hidden rounded-sm p-0"
			>
				<div className="flex h-8 items-center justify-between border-b px-3 text-muted-foreground">
					<span>
						<span className="text-foreground">{updates.length}</span>{" "}
						{updates.length === 1 ? "change" : "changes"} in{" "}
						<span className="text-foreground">{rows.size}</span>{" "}
						{rows.size === 1 ? "row" : "rows"}
					</span>
					<span className="flex items-center gap-1.5 text-[0.625rem]">
						<Kbd>{isMac ? "⌘Z" : "Ctrl+Z"}</Kbd>
						undo last
					</span>
				</div>
				<div className="max-h-96 overflow-auto font-mono">
					{[...rows.values()].map((cells, index) => (
						<section key={stableStringify(getRowIdentity(cells[0].rowData, editScope))}>
							<h3 className="sticky top-0 z-10 flex min-h-6 items-center py-1 border-b bg-popover px-3 text-[0.625rem] text-muted-foreground">
								{rowLabel(cells[0].rowData, index)}
							</h3>
							<ul className="divide-y">
								{cells.map((cell) => (
									<li
										key={cell.columnName}
										className="group/change grid grid-cols-[7rem_minmax(0,1fr)_auto] items-start gap-x-2 py-1.5 pr-1.5 pl-3"
									>
										<span
											className="truncate pt-px text-foreground"
											title={cell.columnName}
										>
											{cell.columnName}
										</span>
										<div className="grid gap-px">
											<DiffLine
												value={cell.originalValue}
												added={false}
											/>
											<DiffLine
												value={cell.newValue}
												added
											/>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											className="self-center pointer-fine:opacity-0 pointer-fine:group-hover/change:opacity-100 pointer-fine:focus-visible:opacity-100"
											onClick={() => clearUpdate(cell.rowData, cell.columnName, editScope)}
											disabled={isUpdatingCell}
											aria-label={`Revert ${cell.columnName}`}
											title="Revert to the original value"
										>
											<Undo2 />
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
