import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
} from "@/components/ui/pagination";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useTableData } from "@/hooks/use-table-data";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { CONSTANTS } from "@/utils/constants";

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

	const handleLimitChange = (value: string) => {
		setLimit(value);
		// Reset cursor when changing page size
		setCursor(null);
		setDirection(null);
	};

	const handleNextPage = () => {
		if (tableData?.meta?.nextCursor) {
			setCursor(tableData.meta.nextCursor);
			setDirection("forward");
		}
	};

	const handlePrevPage = () => {
		if (tableData?.meta?.prevCursor) {
			setCursor(tableData.meta.prevCursor);
			setDirection("backward");
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
				{/* Results per page */}
				<Label className="text-xs text-zinc-400 whitespace-nowrap">
					Rows per page
				</Label>
				<Select
					value={limit?.toString() || "50"}
					onValueChange={(value) => {
						handleLimitChange(value);
					}}
				>
					<SelectTrigger
						size="sm"
						className="h-6 text-xs px-2 border-none bg-transparent! shadow-none hover:bg-transparent! gap-2"
					>
						<SelectValue placeholder="Select number of results" />
					</SelectTrigger>
					<SelectContent className="[&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8 [&_*[role=option]>span]:start-auto [&_*[role=option]>span]:end-2 border-zinc-800">
						{[5, 10, 25, 50].map((size) => (
							<SelectItem
								key={size}
								value={size.toString()}
							>
								{size}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
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
			<div className="flex items-center gap-1">
				<Button
					size="sm"
					variant="ghost"
					className="h-6 px-2 text-xs disabled:opacity-30"
					onClick={handleFirstPage}
					disabled={!tableData?.meta?.hasPreviousPage || totalRows === 0}
					aria-label="Go to first page"
				>
					First
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
