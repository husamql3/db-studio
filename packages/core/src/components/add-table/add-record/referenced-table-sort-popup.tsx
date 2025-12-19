import { IconArrowsSort, IconX } from "@tabler/icons-react";
import { parseAsJson, useQueryState } from "nuqs";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTableCols } from "@/hooks/use-table-cols";
import type { Sort, SortDirection } from "@/hooks/use-table-data";
import { CONSTANTS } from "@/utils/constants";

export const ReferencedTableSortPopup = ({ tableName }: { tableName: string }) => {
	const { tableCols } = useTableCols(tableName);
	const [sorts, setSorts] = useQueryState<Sort[]>(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.SORT,
		parseAsJson((value) => value as Sort[])
			.withDefault([])
			.withOptions({ history: "push" }),
	);

	const [isOpen, setIsOpen] = useState(false);
	const [localSort, setLocalSort] = useState<Sort[]>([]);

	const handleAddSort = () => {
		const firstColumn = tableCols?.[0]?.columnName ?? "";
		setLocalSort([...localSort, { columnName: firstColumn, direction: "asc" }]);
	};

	const handleRemoveSort = (index: number) => {
		setLocalSort(localSort.filter((_, i) => i !== index));
	};

	const handleSortColumnChange = (index: number, columnName: string) => {
		setLocalSort(
			localSort.map((sort, i) => (i === index ? { ...sort, columnName } : sort)),
		);
	};

	const handleSortDirectionChange = (index: number, direction: SortDirection) => {
		setLocalSort(
			localSort.map((sort, i) => (i === index ? { ...sort, direction } : sort)),
		);
	};

	const handleReset = () => {
		setLocalSort([]);
		setSorts([]);
		setIsOpen(false);
	};

	const applySorts = () => {
		const validSorts = localSort.filter((s) => s.columnName);
		setSorts(validSorts);
		setIsOpen(false);
	};

	const hasActiveSorts = sorts.length > 0;

	// Sync local state with URL sorts when popover opens
	const handleOpenChange = (open: boolean) => {
		if (open) {
			setLocalSort(sorts);
		}
		setIsOpen(open);
	};

	return (
		<Popover
			open={isOpen}
			onOpenChange={handleOpenChange}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					className="border-r border-l-0 border-y-0 border-zinc-800 rounded-none text-xs h-full"
				>
					<IconArrowsSort className="size-4" />
					Sort
					{hasActiveSorts && (
						<Kbd className="text-[10px] font-normal text-white bg-primary/10 border border-primary/90 px-1.5 py-0.5">
							{sorts.length}
						</Kbd>
					)}
				</Button>
			</PopoverTrigger>

			<PopoverContent
				className="w-md space-y-2"
				align="start"
			>
				<div className="flex items-center gap-4">
					<Button
						variant="outline"
						size="lg"
						className="text-sm"
						onClick={handleAddSort}
					>
						Add sort
						{localSort && localSort.length > 0 && (
							<Kbd className="text-xs font-normal text-white bg-primary/10 border border-primary/90 px-1.5 py-0.5">
								{localSort.length}
							</Kbd>
						)}
					</Button>
				</div>

				<div className="flex flex-col gap-4">
					{localSort.length > 0 ? (
						localSort.map((sort, index) => (
							<div
								key={index}
								className="flex-1 flex h-9 gap-2 items-center"
							>
								<Select
									value={sort.columnName}
									onValueChange={(value) => handleSortColumnChange(index, value)}
								>
									<SelectTrigger className="w-full flex-1">
										<SelectValue placeholder="Select column" />
									</SelectTrigger>
									<SelectContent>
										{tableCols?.map((col) => (
											<SelectItem
												key={col.columnName}
												value={col.columnName}
											>
												{col.columnName}
											</SelectItem>
										))}
									</SelectContent>
								</Select>

								<div className="flex items-center space-x-2">
									<Label htmlFor={`sort-direction-${index}`}>Asc</Label>
									<Switch
										id={`sort-direction-${index}`}
										checked={sort.direction === "desc"}
										onCheckedChange={(checked) =>
											handleSortDirectionChange(index, checked ? "desc" : "asc")
										}
									/>
									<Label htmlFor={`sort-direction-${index}`}>Desc</Label>
								</div>

								<Button
									variant="ghost"
									size="icon"
									className="text-xs"
									onClick={() => handleRemoveSort(index)}
								>
									<IconX className="size-4" />
								</Button>
							</div>
						))
					) : (
						<div className="flex-1 flex h-9 gap-2 items-center justify-center">
							<p className="text-sm text-muted-foreground text-center">
								No sorts applied
							</p>
						</div>
					)}
				</div>

				<div className="gap-2 flex justify-end">
					<Button
						variant="outline"
						size="lg"
						className="text-sm"
						onClick={handleReset}
					>
						Reset
					</Button>
					<Button
						variant="default"
						size="lg"
						className="text-sm"
						onClick={applySorts}
					>
						Apply
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};
