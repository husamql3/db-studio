import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft } from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { useTableData } from "@/hooks/use-table-data";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { CONSTANTS, PRESET_SIZES } from "@/utils/constants";

export const TableFooter = ({ tableName }: { tableName: string }) => {
	const {
		sidebar: { isPinned, width },
	} = usePersonalPreferencesStore();
	const [limit, setLimit] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.LIMIT);
	const [, setCursor] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.CURSOR);
	const [, setDirection] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.DIRECTION);
	const { tableData } = useTableData({ tableName });

	const totalRows = tableData?.meta?.total ?? 0;
	const dataLength = tableData?.data?.length ?? 0;

	const [inputValue, setInputValue] = useState(limit ?? "50");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setInputValue(limit ?? "50");
	}, [limit]);

	const handleLimitChange = (value: string) => {
		const num = parseInt(value, 10);
		if (Number.isNaN(num) || num < 1) return;
		const clamped = Math.min(num, 10000).toString();
		setInputValue(clamped);
		setLimit(clamped);
		// Reset cursor when changing page size
		setCursor(null);
		setDirection(null);
	};

	const handleNextPage = () => {
		if (tableData?.meta?.nextCursor) {
			setCursor(tableData.meta.nextCursor);
			setDirection("asc");
		}
	};

	const handlePrevPage = () => {
		if (tableData?.meta?.prevCursor) {
			setCursor(tableData.meta.prevCursor);
			setDirection("desc");
		}
	};

	const handleFirstPage = () => {
		// Reset to first page by clearing cursor
		setCursor(null);
		setDirection(null);
	};

	return (
		<footer
			className="fixed bottom-0 left-0 right-0 h-9 border-t border-zinc-800 flex items-center justify-between bg-black px-2 text-white"
			style={{
				marginLeft: isPinned ? `${width}px` : "0",
			}}
		>
			<div className="flex items-center gap-2">
				<Label className="text-xs text-zinc-400 whitespace-nowrap">Rows per page</Label>
				<div className="flex items-center h-6 rounded-sm border border-transparent hover:border-zinc-700 focus-within:border-zinc-600 transition-colors">
					<input
						ref={inputRef}
						type="number"
						min={1}
						max={10000}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onBlur={(e) => handleLimitChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								inputRef.current?.blur();
							}
						}}
						className="w-10 h-full bg-transparent text-xs text-center text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
					/>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="flex items-center h-full px-0.5 text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none"
								aria-label="Choose preset row count"
							>
								<ChevronDown className="size-3" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							className="min-w-16 border-zinc-800"
						>
							{PRESET_SIZES.map((size) => (
								<DropdownMenuItem
									key={size}
									onSelect={() => handleLimitChange(size.toString())}
									className="text-xs justify-center"
								>
									{size}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* Row count information */}
			<div className="flex items-center justify-center text-xs text-zinc-400">
				<p
					className="whitespace-nowrap"
					aria-live="polite"
				>
					Showing <span className="text-zinc-200">{dataLength}</span> of{" "}
					<span className="text-zinc-200">{totalRows}</span> rows
				</p>
			</div>

			{/* Pagination buttons */}
			<div className="flex items-center gap-0.5">
				<Button
					size="sm"
					variant="ghost"
					className="h-6 w-6 disabled:opacity-30"
					onClick={handleFirstPage}
					disabled={!tableData?.meta?.hasPreviousPage || totalRows === 0}
					aria-label="Go to first page"
				>
					<ChevronsLeft aria-hidden="true" />
				</Button>
				<Pagination>
					<PaginationContent className="gap-0.5">
						<PaginationItem>
							<Button
								size="icon-sm"
								variant="ghost"
								className="h-6 w-6 disabled:opacity-30"
								onClick={handlePrevPage}
								disabled={!tableData?.meta?.hasPreviousPage || totalRows === 0}
								aria-label="Go to previous page"
							>
								<ChevronLeft aria-hidden="true" />
							</Button>
						</PaginationItem>
						<PaginationItem>
							<Button
								size="icon-sm"
								variant="ghost"
								className="h-6 w-6 disabled:opacity-30"
								onClick={handleNextPage}
								disabled={!tableData?.meta?.hasNextPage || totalRows === 0}
								aria-label="Go to next page"
							>
								<ChevronRight aria-hidden="true" />
							</Button>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			</div>
		</footer>
	);
};
