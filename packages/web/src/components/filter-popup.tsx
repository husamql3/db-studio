import type { FilterType } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import { Input } from "@db-studio/ui/input";
import { Kbd } from "@db-studio/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@db-studio/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { cn } from "@db-studio/ui/utils";
import { Filter, X } from "lucide-react";
import { useState } from "react";
import { useTableCols } from "@/hooks/use-table-cols";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";

/** Edits a copy of `filters` and hands the result to `onApply`, so callers keep the state. */
export const FilterPopup = ({
	tableName,
	filters,
	onApply,
	variant = "toolbar",
}: {
	tableName: string;
	filters: FilterType[];
	onApply: (filters: FilterType[]) => void;
	/** "sheet" labels the trigger and makes the popover modal, for use inside a sheet. */
	variant?: "toolbar" | "sheet";
}) => {
	const { tableCols } = useTableCols({ tableName, schemaName: useTableSchemaName() });

	const [isOpen, setIsOpen] = useState(false);
	const [localFilters, setLocalFilters] = useState<FilterType[]>([]);

	const handleAddFilter = () => {
		const firstColumn = tableCols?.[0]?.columnName ?? "";
		setLocalFilters((prev) => [
			...prev,
			{ columnName: firstColumn, operator: "=", value: "" },
		]);
	};

	const handleRemoveFilter = (index: number) => {
		setLocalFilters(localFilters.filter((_, i) => i !== index));
	};

	const handleFilterColumnChange = (index: number, columnName: string) => {
		setLocalFilters(
			localFilters.map((filter, i) => (i === index ? { ...filter, columnName } : filter)),
		);
	};

	const handleFilterValueChange = (index: number, value: string) => {
		setLocalFilters(
			localFilters.map((filter, i) => (i === index ? { ...filter, value } : filter)),
		);
	};

	const handleFilterOperatorChange = (index: number, operator: string) => {
		setLocalFilters(
			localFilters.map((filter, i) => (i === index ? { ...filter, operator } : filter)),
		);
	};

	const handleReset = () => {
		setLocalFilters([]);
		onApply([]);
		setIsOpen(false);
	};

	const applyFilters = () => {
		const validFilters = localFilters.filter(
			(f) => f.columnName && f.operator && f.value !== "",
		);

		onApply(validFilters);
		setIsOpen(false);
	};

	const hasActiveFilters = filters.length > 0;

	const handleOpenChange = (open: boolean) => {
		if (open) {
			setLocalFilters(filters);
		}

		setIsOpen(open);
	};

	return (
		<Popover
			modal={variant === "sheet"}
			open={isOpen}
			onOpenChange={handleOpenChange}
		>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className={cn(
						"border-l-0 border-y-0 border-r border-border rounded-none text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors",
						variant === "sheet" ? "text-xs h-full" : "size-8! aspect-square",
					)}
					aria-label="Filter table data"
					data-active={hasActiveFilters}
				>
					<Filter className="size-4" />
					{variant === "sheet" && "Filter"}
					{variant === "sheet" && hasActiveFilters && (
						<Kbd className="text-[10px] font-normal text-primary bg-primary/10 border border-primary/30 px-1.5 py-0.5">
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
							<Kbd className="text-xs font-normal text-primary bg-primary/10 border border-primary/30 px-1.5 py-0.5">
								{localFilters.length}
							</Kbd>
						)}
					</Button>
				</div>

				<div className="flex flex-col gap-4">
					{localFilters.length > 0 ? (
						localFilters.map((filter, index) => (
							<div
								key={`${filter.columnName}-${index}`}
								className="flex-1 flex h-9 gap-2"
							>
								<Select
									value={filter.columnName}
									onValueChange={(value) => handleFilterColumnChange(index, value)}
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
									onValueChange={(value) => handleFilterOperatorChange(index, value)}
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
									onChange={(e) => handleFilterValueChange(index, e.target.value)}
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
							<p className="text-sm text-muted-foreground text-center">No filters applied</p>
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
