import {
	IconChevronLeft,
	IconChevronLeftPipe,
	IconChevronRight,
	IconChevronRightPipe,
} from "@tabler/icons-react";
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
	const [pageSize, setPageSize] = useQueryState(
		CONSTANTS.TABLE_STATE_KEYS.LIMIT,
	);
	const [page, setPage] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.PAGE);
	const { tableData } = useTableData({ tableName });

	const totalRows = tableData?.meta?.total ?? 0;
	const totalPages = tableData?.meta?.totalPages ?? 0;

	const handlePageSizeChange = (value: string) => {
		setPageSize(value);
	};

	const handlePageChange = (newPage: number) => {
		setPage(newPage.toString());
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
					value={pageSize?.toString() || "50"}
					onValueChange={(value) => {
						handlePageSizeChange(value);
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

			{/* Page number information */}
			<div className="flex items-center justify-center text-xs text-zinc-400">
				<p
					className="whitespace-nowrap"
					aria-live="polite"
				>
					<span className="text-zinc-200">
						{(Number(page) - 1) * Number(pageSize) + 1}-
						{Math.min(Number(page) * Number(pageSize), totalRows)}
					</span>{" "}
					of{" "}
					<span className="text-zinc-200">
						{tableData?.meta?.total.toString()}
					</span>
				</p>
			</div>

			{/* Pagination buttons */}
			<div className="flex items-center">
				<Pagination>
					<PaginationContent className="gap-0.5">
						<PaginationItem>
							<Button
								size="icon-sm"
								variant="ghost"
								className="h-6 w-6 disabled:opacity-30"
								onClick={() => {
									handlePageChange(1);
								}}
								disabled={Number(page) <= 1 || totalRows === 0}
								aria-label="Go to first page"
							>
								<IconChevronLeftPipe aria-hidden="true" />
							</Button>
						</PaginationItem>
						<PaginationItem>
							<Button
								size="icon-sm"
								variant="ghost"
								className="h-6 w-6 disabled:opacity-30"
								onClick={() => {
									handlePageChange(Number(page) - 1);
								}}
								disabled={Number(page) <= 1 || totalRows === 0}
								aria-label="Go to previous page"
							>
								<IconChevronLeft aria-hidden="true" />
							</Button>
						</PaginationItem>
						<PaginationItem>
							<Button
								size="icon-sm"
								variant="ghost"
								className="h-6 w-6 disabled:opacity-30"
								onClick={() => {
									handlePageChange(Number(page) + 1);
								}}
								disabled={Number(page) >= totalPages || totalRows === 0}
								aria-label="Go to next page"
							>
								<IconChevronRight aria-hidden="true" />
							</Button>
						</PaginationItem>
						<PaginationItem>
							<Button
								size="icon-sm"
								variant="ghost"
								className="h-6 w-6 disabled:opacity-30"
								onClick={() => {
									handlePageChange(totalPages);
								}}
								disabled={Number(page) >= totalPages || totalRows === 0}
								aria-label="Go to last page"
							>
								<IconChevronRightPipe aria-hidden="true" />
							</Button>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			</div>
		</footer>
	);
};
