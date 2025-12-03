import { useQuery } from "@tanstack/react-query";
import {
	flexRender,
	getCoreRowModel,
	type Row,
	useReactTable,
} from "@tanstack/react-table";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	ArrowUpDown,
	FilterIcon,
	Loader2,
} from "lucide-react";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { AddRecordFormData } from "@/hooks/use-create-record";
import { useTableData } from "@/hooks/use-table-data";
import { queries } from "@/providers/queries";
import { useSheetStore } from "@/stores/sheet.store";

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
	const { data: tableCols, isLoading: isLoadingTableCols } = useQuery(
		queries.tableCols(tableName),
	);
	const { tableData, isLoadingTableData } = useTableData(tableName);

	const columns = useMemo(() => {
		return (
			tableCols?.map((item) => ({
				id: item.columnName,
				accessorKey: item.columnName,
				header: item.columnName,
				cell: ({ row }: { row: Row<Record<string, unknown>> }) => (
					<div className="font-medium max-w-[200px] truncate">
						{row.getValue(item.columnName)}
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
				<Loader2 className="size-4 animate-spin" />
			</div>
		);
	}

	return (
		<div>
			<div className="h-8 border-b border-zinc-800 w-full flex items-center justify-between bg-black sticky top-0 left-0 right-0 z-0">
				<div className="flex items-center">
					<Button
						variant="ghost"
						size="sm"
						className="border-r border-zinc-800 rounded-none text-xs"
					>
						<FilterIcon className="size-3" />
						Filter
					</Button>

					<Button
						variant="ghost"
						size="sm"
						className="border-r border-zinc-800 rounded-none text-xs"
					>
						<ArrowUpDown className="size-3" />
						Sort
					</Button>
				</div>

				<div className="flex items-center">
					<Button
						variant="ghost"
						size="sm"
						className="border-l border-zinc-800 rounded-none text-xs"
					>
						<ArrowLeftIcon className="size-3" />
					</Button>

					<Button
						variant="ghost"
						size="sm"
						className="border-l border-zinc-800 rounded-none text-xs"
					>
						<ArrowRightIcon className="size-3" />
					</Button>
				</div>
			</div>

			<Table>
				<TableHeader className="bg-zinc-950">
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow
							className="hover:bg-transparent text-xs"
							key={headerGroup.id}
						>
							{headerGroup.headers.map((header) => {
								return (
									<TableHead key={header.id}>
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
									<TableCell key={cell.id}>
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
