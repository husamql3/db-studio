import { Filter, X } from "lucide-react";
import { parseAsJson, useQueryState } from "nuqs";
import { useState } from "react";
import type { Filter as FilterType } from "shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useTableCols } from "@/hooks/use-table-cols";
import { CONSTANTS } from "@/utils/constants";

export const ReferencedTableFilterPopup = ({
	tableName,
}: {
	tableName: string;
}) => {
	const [filters, setFilters] = useQueryState<FilterType[]>(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.FILTERS,
		parseAsJson((value) => value as FilterType[])
			.withDefault([])
			.withOptions({ history: "push" }),
	);
	const [, setCursor] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.CURSOR,
	);
	const [, setDirection] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.DIRECTION,
	);
	const { tableCols } = useTableCols({ tableName });

	const [isOpen, setIsOpen] = useState(false);
	const [localFilters, setLocalFilters] = useState<FilterType[]>([]);

	const handleAddFilter = () => {
		const firstColumn = tableCols?.[0]?.columnName ?? "";
		setLocalFilters([
			...localFilters,
			{ columnName: firstColumn, operator: "=", value: "" },
		]);
	};

	const handleRemoveFilter = (index: number) => {
		setLocalFilters(localFilters.filter((_, i) => i !== index));
	};

	const handleFilterColumnChange = (index: number, columnName: string) => {
		setLocalFilters(
			localFilters.map((filter, i) =>
				i === index ? { ...filter, columnName } : filter,
			),
		);
	};

	const handleFilterValueChange = (index: number, value: string) => {
		setLocalFilters(
			localFilters.map((filter, i) =>
				i === index ? { ...filter, value } : filter,
			),
		);
	};

	const handleFilterOperatorChange = (index: number, operator: string) => {
		setLocalFilters(
			localFilters.map((filter, i) =>
				i === index ? { ...filter, operator } : filter,
			),
		);
	};

	const handleReset = () => {
		setLocalFilters([]);
		setFilters([]);
		// Reset cursor when filters change
		setCursor(null);
		setDirection(null);
		setIsOpen(false);
	};

	const applyFilters = () => {
		const validFilters = localFilters.filter(
			(f) => f.columnName && f.operator && f.value !== "",
		);

		setFilters(validFilters);
		// Reset cursor when filters change
		setCursor(null);
		setDirection(null);
		setIsOpen(false);
	};

	const hasActiveFilters = filters.length > 0;

	// Sync local state with URL filters when popover opens
	const handleOpenChange = (open: boolean) => {
		if (open) {
			setLocalFilters(filters);
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
					type="button"
					variant="ghost"
					className="border-r border-l-0 border-y-0 border-zinc-800 rounded-none text-xs h-full"
					aria-label="Filter table data"
					data-active={hasActiveFilters}
				>
					<Filter className="size-4" />
					Filter
					{hasActiveFilters && (
						<Kbd className="text-[10px] font-normal text-white bg-primary/10 border border-primary/90 px-1.5 py-0.5">
							{filters.length}
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
						onClick={handleAddFilter}
					>
						Add filter
						{localFilters && localFilters.length > 0 && (
							<Kbd className="text-xs font-normal text-white bg-primary/10 border border-primary/90 px-1.5 py-0.5">
								{localFilters.length}
							</Kbd>
						)}
					</Button>
				</div>

				<div className="flex flex-col gap-4">
					{localFilters.length > 0 ? (
						localFilters.map((filter, index) => (
							<div
								key={index}
								className="flex-1 flex h-9 gap-2"
							>
								<Select
									value={filter.columnName}
									onValueChange={(value) =>
										handleFilterColumnChange(index, value)
									}
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

								<Select
									value={filter.operator}
									onValueChange={(value) =>
										handleFilterOperatorChange(index, value)
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Op" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="=">=</SelectItem>
										<SelectItem value="!=">!=</SelectItem>
										<SelectItem value=">">&gt;</SelectItem>
										<SelectItem value=">=">&gt;=</SelectItem>
										<SelectItem value="<">&lt;</SelectItem>
										<SelectItem value="<=">&lt;=</SelectItem>
										<SelectItem value="is">is</SelectItem>
										<SelectItem value="is not">is not</SelectItem>
										<SelectItem value="like">like</SelectItem>
										<SelectItem value="not like">not like</SelectItem>
										<SelectItem value="ilike">ilike</SelectItem>
										<SelectItem value="not ilike">not ilike</SelectItem>
									</SelectContent>
								</Select>

								<Input
									type="text"
									placeholder="Value"
									value={filter.value as string}
									onChange={(e) =>
										handleFilterValueChange(index, e.target.value)
									}
								/>

								<Button
									variant="ghost"
									size="icon"
									className="text-xs"
									onClick={() => handleRemoveFilter(index)}
								>
									<X className="size-4" />
								</Button>
							</div>
						))
					) : (
						<div className="flex-1 flex h-9 gap-2 items-center justify-center">
							<p className="text-sm text-muted-foreground text-center">
								No filters applied
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
						onClick={applyFilters}
					>
						Apply
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};
