import { useQuery } from "@tanstack/react-query";
import { FilterIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { queries } from "@/providers/queries";
import { type Filter, useActiveTableStore } from "@/stores/active-table.store";
import { cn } from "@/utils/cn";

export const FilterPopup = () => {
	const {
		activeTable,
		filters: storeFilters,
		setFilters: setStoreFilters,
		clearFilters,
	} = useActiveTableStore();
	const { data: tableCols } = useQuery(queries.tableCols(activeTable ?? ""));

	const [isOpen, setIsOpen] = useState(false);
	const [filters, setFilters] = useState<Filter[]>(storeFilters);

	const handleAddFilter = () => {
		const firstColumn = tableCols?.[0]?.columnName ?? "";
		setFilters([...filters, { columnName: firstColumn, operator: "=", value: "" }]);
	};

	const handleRemoveFilter = (index: number) => {
		setFilters(filters.filter((_, i) => i !== index));
	};

	const handleFilterColumnChange = (index: number, columnName: string) => {
		setFilters(
			filters.map((filter, i) => (i === index ? { ...filter, columnName } : filter)),
		);
	};

	const handleFilterValueChange = (index: number, value: string) => {
		setFilters(filters.map((filter, i) => (i === index ? { ...filter, value } : filter)));
	};

	const handleFilterOperatorChange = (index: number, operator: string) => {
		setFilters(
			filters.map((filter, i) => (i === index ? { ...filter, operator } : filter)),
		);
	};

	const handleReset = () => {
		setFilters([]);
		clearFilters();
		setIsOpen(false);
	};

	const applyFilters = () => {
		// Only apply filters that have all fields filled
		const validFilters = filters.filter((f) => f.columnName && f.operator && f.value);

		setFilters(validFilters);
		setStoreFilters(validFilters);
		setIsOpen(false);
	};

	const hasActiveFilters = storeFilters.length > 0;

	// Sync local state with store filters when popover opens
	const handleOpenChange = (open: boolean) => {
		if (open) {
			setFilters(storeFilters);
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
					className={cn(
						"relative aspect-square rounded-none size-8 border-r border-zinc-800 flex items-center justify-center text-sm font-medium hover:bg-zinc-900 transition-colors",
						hasActiveFilters ? "text-primary" : "text-zinc-400",
					)}
				>
					<FilterIcon className="size-4" />
					{hasActiveFilters && (
						<span className="absolute top-1 right-1 size-2 bg-primary rounded-full" />
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-md space-y-6"
				align="start"
			>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						className="text-xs"
						onClick={handleAddFilter}
					>
						Add filter
						<Badge className="text-xs leading-0! size-5 flex items-center justify-center">
							{filters.length}
						</Badge>
					</Button>
				</div>

				<div className="flex flex-col gap-4">
					{filters.length > 0 ? (
						filters.map((filter, index) => (
							<div
								key={index}
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
									value={filter.value}
									onChange={(e) => handleFilterValueChange(index, e.target.value)}
								/>

								<Button
									variant="ghost"
									size="icon"
									className="text-xs"
									onClick={() => handleRemoveFilter(index)}
								>
									<XIcon className="size-4" />
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

				<div className="gap-2 flex justify-end mt-4">
					<Button
						variant="outline"
						size="sm"
						className="text-xs"
						onClick={handleReset}
					>
						Reset
					</Button>
					<Button
						variant="default"
						size="sm"
						className="text-xs"
						onClick={applyFilters}
					>
						Apply
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};
