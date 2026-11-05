import type { FilterType, SortDirection, SortType } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import { Spinner } from "@db-studio/ui/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@db-studio/ui/table";
import { flexRender, getCoreRowModel, type Row, useReactTable } from "@tanstack/react-table";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { FilterPopup, useTableData } from "@/features/tables";
import { useTableCols } from "@/hooks/use-table-cols";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { useOverlayStore } from "@/stores/overlay.store";
import { formatCellValue } from "@/utils/format-cell-value";
import type { AddRecordFormData } from "../hooks/use-create-record";
import { ReferencedTableSortPopup } from "./referenced-table-sort-popup";

// The picker keeps its own page, sort and filters, so the grid behind it keeps the URL's.
const PICKER_PAGE_LIMIT = "30";

export const ReferencedTable = ({
	tableName,
	referencedColumn,
	columnName,
}: {
	tableName: string;
	referencedColumn: string;
	columnName: string;
}) => {
	const { setValue } = useFormContext<AddRecordFormData>();
	const { closeOverlay } = useOverlayStore();
	// An FK references a table in its own schema, the open table's.
	const schemaName = useTableSchemaName();
	const { tableCols, isLoadingTableCols } = useTableCols({ tableName, schemaName });

	const [cursor, setCursor] = useState<{ cursor: string; direction: SortDirection } | null>(
		null,
	);

	const [sorts, setSorts] = useState<SortType[]>([]);
	const [filters, setFilters] = useState<FilterType[]>([]);

	const { tableData, isLoadingTableData } = useTableData({
		tableName,
		schemaName,
		cursor: cursor?.cursor ?? null,
		direction: cursor?.direction ?? null,
		limit: PICKER_PAGE_LIMIT,
		sort: sorts.length > 0 ? JSON.stringify(sorts) : null,
		order: null,
		filters,
	});

	const handleNextPage = () => {
		if (tableData?.meta?.nextCursor) {
			setCursor({ cursor: tableData.meta.nextCursor, direction: "asc" });
		}
	};

	const handlePrevPage = () => {
		if (tableData?.meta?.prevCursor) {
			setCursor({ cursor: tableData.meta.prevCursor, direction: "desc" });
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

	const handleSelectRow = (row: Row<Record<string, unknown>>) => {
		setValue(columnName, row.original[referencedColumn] as string);
		closeOverlay("records.record-reference");
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
			<div className="sticky top-0 left-0 right-0 h-8 border-b border-border w-full flex items-center justify-between bg-background z-50">
				<div className="flex items-center h-full">
					<FilterPopup
						tableName={tableName}
						filters={filters}
						onApply={(next) => {
							setFilters(next);
							setCursor(null);
						}}
						variant="sheet"
					/>
					<ReferencedTableSortPopup
						tableName={tableName}
						sorts={sorts}
						onApply={(next) => {
							setSorts(next);
							setCursor(null);
						}}
					/>
				</div>

				<div className="flex items-center h-full">
					<Button
						variant="ghost"
						size="icon"
						className="border-l border-r-0 border-y-0 border-border rounded-none text-xs h-full aspect-square size-8 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
						onClick={handlePrevPage}
						disabled={!tableData?.meta?.hasPreviousPage}
					>
						<ArrowLeftIcon className="size-3" />
					</Button>

					<Button
						variant="ghost"
						size="icon"
						className="border-r border-l border-y-0 border-border rounded-none text-xs h-full aspect-square size-8 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
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
							className="hover:bg-transparent text-xs sticky top-0 right-0 left-0 supports-backdrop-filter:backdrop-blur-sm"
							key={headerGroup.id}
						>
							{headerGroup.headers.map((header) => {
								return (
									<TableHead
										key={header.id}
										className="border-r border-border"
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
										className="border-r border-border"
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
