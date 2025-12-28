import {
	flexRender,
	getCoreRowModel,
	type Row,
	useReactTable,
} from "@tanstack/react-table";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { ReferencedTableFilterPopup } from "@/components/add-table/add-record/referenced-table-filter-popup";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { AddRecordFormData } from "@/hooks/use-create-record";
import { useTableCols } from "@/hooks/use-table-cols";
import { useTableData } from "@/hooks/use-table-data";
import { useSheetStore } from "@/stores/sheet.store";
import { CONSTANTS } from "@/utils/constants";
import { ReferencedTableSortPopup } from "./referenced-table-sort-popup";

// Helper function to format cell value for display
const formatCellValue = (value: unknown): string => {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	return String(value);
};

export const ReferencedTable = ({
	tableName,
	referencedColumn,
	columnName,
}: {
	tableName: string;
	referencedColumn: string | null;
	columnName: string;
}) => {
	const { setValue } = useFormContext<AddRecordFormData>();
	const { closeSheet } = useSheetStore();
	const { tableCols, isLoadingTableCols } = useTableCols(tableName);
	const [referencedActiveTable, setReferencedActiveTable] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ACTIVE_TABLE,
	);
	const { tableData, isLoadingTableData } = useTableData(true);
	const [page, setPage] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.PAGE.toString(),
	);
	const [pageSize, setPageSize] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.LIMIT.toString(),
	);

	// Initialize the referenced table state when component mounts or tableName changes
	useEffect(() => {
		if (tableName && referencedActiveTable !== tableName) {
			setReferencedActiveTable(tableName);
		}
		if (tableName && !page) {
			setPage(CONSTANTS.REFERENCED_TABLE_STATE_KEYS.DEFAULT_PAGE.toString()); // page 1 for referenced table
		}
		if (tableName && !pageSize) {
			setPageSize(CONSTANTS.REFERENCED_TABLE_STATE_KEYS.DEFAULT_LIMIT.toString()); // limit 30 for referenced table
		}
	}, [
		tableName,
		referencedActiveTable,
		page,
		pageSize,
		setReferencedActiveTable,
		setPage,
		setPageSize,
	]);

	const totalPages = tableData?.meta?.totalPages ?? 0;

	const handlePageChange = (newPage: number) => {
		setPage(newPage.toString());
	};

	const columns = useMemo(() => {
		return (
			tableCols?.map((item) => ({
				id: item.columnName,
				accessorKey: item.columnName,
				header: item.columnName,
				cell: ({ row }: { row: Row<Record<string, unknown>> }) => (
					<div className="font-medium max-w-[200px] truncate">
						{formatCellValue(row.getValue(item.columnName))}
					</div>
				),
			})) ?? []
		);
	}, [tableCols]);

	const table = useReactTable({
		columns: columns ?? [],
		data: tableData?.data ?? [],
		getCoreRowModel: getCoreRowModel(),
	});

	// select the row and close the sheet
	const handleSelectRow = (row: Row<Record<string, unknown>>) => {
		console.log(row.original[referencedColumn ?? ""]);
		setValue(columnName ?? "", row.original[referencedColumn ?? ""] as string);
		closeSheet("record-reference");
	};

	if (isLoadingTableCols || isLoadingTableData) {
		return (
			<div className="flex items-center justify-center h-full">
				<Spinner size="size-8" />
			</div>
		);
	}

	return (
		<div>
			<div className="sticky top-0 left-0 right-0 h-8 border-b border-zinc-800 w-full flex items-center justify-between bg-background z-50">
				<div className="flex items-center h-full">
					<ReferencedTableFilterPopup tableName={tableName} />
					<ReferencedTableSortPopup tableName={tableName} />
				</div>

				<div className="flex items-center h-full">
					<Button
						variant="ghost"
						size="icon"
						className="border-l border-r-0 border-y-0 border-zinc-800 rounded-none text-xs h-full aspect-square size-8"
						onClick={() => handlePageChange(Number(page) - 1)}
						disabled={Number(page) <= 1}
					>
						<ArrowLeftIcon className="size-3" />
					</Button>

					<Button
						variant="ghost"
						size="icon"
						className="border-r border-l border-y-0 border-zinc-800 rounded-none text-xs h-full aspect-square size-8"
						onClick={() => handlePageChange(Number(page) + 1)}
						disabled={Number(page) >= totalPages}
					>
						<ArrowRightIcon className="size-3" />
					</Button>
				</div>
			</div>

			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow
							className="hover:bg-transparent text-xs sticky top-0 right-0 left-0"
							key={headerGroup.id}
						>
							{headerGroup.headers.map((header) => {
								return (
									<TableHead
										key={header.id}
										className="border-r border-zinc-800"
									>
										{header.isPlaceholder
											? null
											: flexRender(header.column.columnDef.header, header.getContext())}
									</TableHead>
								);
							})}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows?.length ? (
						table.getRowModel().rows.map((row) => (
							<TableRow
								key={row.id}
								className="text-xs cursor-pointer"
								onClick={() => handleSelectRow(row)}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell
										key={cell.id}
										className="border-r border-zinc-800"
									>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell
								className="h-24 text-center"
								colSpan={columns.length}
							>
								No results.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
};
