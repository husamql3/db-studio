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
import { ReferencedTableSortPopup } from "@/components/add-table/add-record/referenced-table-sort-popup";
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
import { formatCellValue } from "@/utils/format-cell-value";

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
	const { tableCols, isLoadingTableCols } = useTableCols({ tableName });
	const [referencedActiveTable, setReferencedActiveTable] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ACTIVE_TABLE,
	);
	const { tableData, isLoadingTableData } = useTableData({
		tableName,
		isReferencedTable: true,
	});
	const [, setCursor] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.CURSOR,
	);
	const [, setDirection] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.DIRECTION,
	);
	const [limit, setLimit] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.LIMIT.toString(),
	);

	// Initialize the referenced table state when component mounts or tableName changes
	useEffect(() => {
		if (tableName && referencedActiveTable !== tableName) {
			setReferencedActiveTable(tableName);
		}
		if (tableName && !limit) {
			setLimit(CONSTANTS.REFERENCED_TABLE_STATE_KEYS.DEFAULT_LIMIT.toString()); // limit 30 for referenced table
		}
	}, [
		tableName,
		referencedActiveTable,
		limit,
		setReferencedActiveTable,
		setLimit,
	]);

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
						onClick={handlePrevPage}
						disabled={!tableData?.meta?.hasPreviousPage}
					>
						<ArrowLeftIcon className="size-3" />
					</Button>

					<Button
						variant="ghost"
						size="icon"
						className="border-r border-l border-y-0 border-zinc-800 rounded-none text-xs h-full aspect-square size-8"
						onClick={handleNextPage}
						disabled={!tableData?.meta?.hasNextPage}
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
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
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
