import { Button } from "@db-studio/ui/button";
import { Checkbox } from "@db-studio/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@db-studio/ui/popover";
import { Separator } from "@db-studio/ui/separator";
import { cn } from "@db-studio/ui/utils";
import {
	CheckCheck,
	ChevronDown,
	ChevronUp,
	GripVertical,
	RotateCcw,
	Search,
	Settings2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTableCols } from "@/features/schema";
import { useColumnPreferences } from "../../hooks/use-column-preferences";

interface ColumnPreferencesMenuProps {
	tableName: string;
}

export const ColumnPreferencesMenu = ({ tableName }: ColumnPreferencesMenuProps) => {
	const [search, setSearch] = useState("");
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	const { tableCols } = useTableCols({ tableName });

	const {
		orderedColumns,
		visibleColumns,
		toggleColumn,
		moveColumn,
		reorderColumn,
		showAllColumns,
		resetColumns,
	} = useColumnPreferences({ tableName, tableCols });

	// menu rows follow the currently saved order, so drag-and-drop reads naturally
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return orderedColumns;
		return orderedColumns.filter((name) => name.toLowerCase().includes(q));
	}, [orderedColumns, search]);

	const visibleSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);
	const totalCount = tableCols?.length ?? 0;
	const hiddenCount = totalCount - visibleColumns.length;
	const isCustomized =
		hiddenCount > 0 ||
		orderedColumns.some((name, i) => (tableCols ?? [])[i]?.columnName !== name);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className={cn(
						"size-8! aspect-square border-l-0 border-y-0 border-r border-border rounded-none text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors",
						isCustomized && "text-foreground",
					)}
					aria-label="Manage columns"
					data-active={isCustomized}
				>
					<Settings2 className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-72 gap-0 p-0"
				onOpenAutoFocus={(e) => {
					e.preventDefault();
					searchRef.current?.focus();
				}}
			>
				<div
					className="flex items-center justify-between px-2 py-1.5 text-sm font-medium"
					role="heading"
					aria-level={2}
				>
					<span>Columns</span>
					<span className="text-xs font-normal text-muted-foreground">
						{visibleColumns.length}/{totalCount} shown
					</span>
				</div>
				<div className="relative px-2 pb-2">
					<Search className="absolute left-4 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
					<input
						ref={searchRef}
						type="text"
						placeholder="Search columns..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full h-8 pl-7 pr-2 text-sm bg-transparent rounded-md border border-border focus:outline-none focus:ring-1 focus:ring-ring"
						aria-label="Search columns"
					/>
				</div>
				<Separator className="my-0" />
				<div
					className="max-h-72 overflow-y-auto py-1"
					role="list"
					aria-label="Database columns"
				>
					{filtered.map((name, i) => {
						const isVisible = visibleSet.has(name);
						return (
							<div
								key={name}
								role="listitem"
								draggable
								onDragStart={() => setDragIndex(i)}
								onDragEnd={() => setDragIndex(null)}
								onDragOver={(e) => e.preventDefault()}
								onDrop={() => {
									if (dragIndex !== null && dragIndex !== i) {
										reorderColumn(filtered[dragIndex], filtered[i]);
									}
									setDragIndex(null);
								}}
								className={cn(
									"group flex items-center gap-1.5 px-2 py-1 rounded-md",
									dragIndex === i && "opacity-40",
								)}
							>
								<span
									role="button"
									tabIndex={0}
									aria-label={`Reorder ${name}`}
									aria-roledescription="sortable"
									title="Drag, or focus and press ArrowUp or ArrowDown to move"
									className="cursor-grab active:cursor-grabbing text-muted-foreground/70 hover:text-muted-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring rounded-sm"
									onKeyDown={(e) => {
										if (e.key === "ArrowUp") {
											e.preventDefault();
											e.stopPropagation();
											moveColumn(name, -1, filtered);
										} else if (e.key === "ArrowDown") {
											e.preventDefault();
											e.stopPropagation();
											moveColumn(name, 1, filtered);
										}
									}}
								>
									<GripVertical className="size-4" />
								</span>
								<Checkbox
									checked={isVisible}
									onCheckedChange={() => toggleColumn(name)}
									aria-label={`Show ${name}`}
								/>
								<span
									className="text-sm flex-1 cursor-pointer select-none truncate"
									onClick={() => toggleColumn(name)}
								>
									{name}
								</span>
								<span className="flex flex-col opacity-0 group-hover:opacity-100 focus-within:opacity-100">
									<button
										type="button"
										tabIndex={0}
										disabled={i === 0}
										aria-label={`Move ${name} up`}
										className="text-muted-foreground/70 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
										onClick={() => moveColumn(name, -1, filtered)}
									>
										<ChevronUp className="size-3.5" />
									</button>
									<button
										type="button"
										tabIndex={0}
										disabled={i === filtered.length - 1}
										aria-label={`Move ${name} down`}
										className="text-muted-foreground/70 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
										onClick={() => moveColumn(name, 1, filtered)}
									>
										<ChevronDown className="size-3.5" />
									</button>
								</span>
							</div>
						);
					})}
					{filtered.length === 0 && (
						<p className="text-sm text-muted-foreground text-center py-4 px-2">
							No columns match &quot;{search}&quot;
						</p>
					)}
				</div>
				<Separator className="my-0" />
				<div className="p-2 flex gap-2">
					<Button
						variant="outline"
						size="sm"
						className="flex-1 text-xs"
						disabled={hiddenCount === 0}
						onClick={showAllColumns}
					>
						<CheckCheck className="size-3.5" />
						Show all
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="flex-1 text-xs"
						disabled={!isCustomized}
						onClick={resetColumns}
					>
						<RotateCcw className="size-3.5" />
						Reset
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};
