import {
	ChevronFirstIcon,
	ChevronLastIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import { useTableData } from "@/hooks/use-table-data";
import { useActiveTableStore } from "@/stores/active-table.store";
import { useSearchParamsUtils } from "@/utils/search-params";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Pagination, PaginationContent, PaginationItem } from "../ui/pagination";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

export const TableFooter = () => {
	const { setParams, setParam, getParamAsNumber } = useSearchParamsUtils();
	const pageSize = getParamAsNumber("pageSize") ?? 50;
	const currentPage = getParamAsNumber("page") ?? 1;

	const { activeTable } = useActiveTableStore();
	const { tableData } = useTableData(activeTable);
	const totalRows = tableData?.meta.total ?? 0;
	const totalPages = tableData?.meta.totalPages ?? 0;

	const handlePageSizeChange = (value: string) => {
		setParams({ pageSize: Number(value), page: 1 }, true);
	};

	const handlePageChange = (page: number) => {
		setParam("page", page, true);
	};

	return (
		<footer className="h-10 border-t border-zinc-800 w-full flex items-center justify-between bg-black px-2">
			<div className="flex items-center gap-2">
				{/* Results per page */}
				<Label className="text-xs text-zinc-400 whitespace-nowrap">Rows per page</Label>
				<Select
					value={pageSize.toString()}
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
						{[5, 10, 25, 50].map((pageSize) => (
							<SelectItem
								key={pageSize}
								value={pageSize.toString()}
							>
								{pageSize}
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
						{(currentPage - 1) * pageSize + 1}-
						{Math.min(currentPage * pageSize, totalRows)}
					</span>{" "}
					of <span className="text-zinc-200">{totalRows.toString()}</span>
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
								disabled={currentPage <= 1 || totalRows === 0}
								aria-label="Go to first page"
							>
								<ChevronFirstIcon
									size={14}
									aria-hidden="true"
								/>
							</Button>
						</PaginationItem>
						<PaginationItem>
							<Button
								size="icon-sm"
								variant="ghost"
								className="h-6 w-6 disabled:opacity-30"
								onClick={() => {
									handlePageChange(currentPage - 1);
								}}
								disabled={currentPage <= 1 || totalRows === 0}
								aria-label="Go to previous page"
							>
								<ChevronLeftIcon
									size={14}
									aria-hidden="true"
								/>
							</Button>
						</PaginationItem>
						<PaginationItem>
							<Button
								size="icon-sm"
								variant="ghost"
								className="h-6 w-6 disabled:opacity-30"
								onClick={() => {
									handlePageChange(currentPage + 1);
								}}
								disabled={currentPage >= totalPages || totalRows === 0}
								aria-label="Go to next page"
							>
								<ChevronRightIcon
									size={14}
									aria-hidden="true"
								/>
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
								disabled={currentPage >= totalPages || totalRows === 0}
								aria-label="Go to last page"
							>
								<ChevronLastIcon
									size={14}
									aria-hidden="true"
								/>
							</Button>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			</div>
		</footer>
	);
};
