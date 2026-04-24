import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import type { BaseResponse, FilterType, TableDataResultSchemaType } from "shared/types";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { useTableCols } from "@/hooks/use-table-cols";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";
import type { TableRecord } from "@/types/table.type";

export const FkDrawerContent = ({
	referencedTable,
	referencedColumn,
	fkValue,
}: {
	referencedTable: string;
	referencedColumn: string;
	fkValue: string;
}) => {
	const { selectedDatabase } = useDatabaseStore();

	const { tableCols } = useTableCols({ tableName: referencedTable });

	const filter: FilterType = useMemo(
		() => ({ columnName: referencedColumn, operator: "=", value: fkValue }),
		[referencedColumn, fkValue],
	);

	const { data: tableData, isLoading } = useQuery({
		queryKey: ["fk-drawer", referencedTable, referencedColumn, fkValue, selectedDatabase],
		queryFn: async () => {
			const res = await api.get<BaseResponse<TableDataResultSchemaType>>(
				`/tables/${referencedTable}/data`,
				{
					params: {
						db: selectedDatabase ?? "",
						limit: "50",
						filters: JSON.stringify([filter]),
					},
				},
			);
			return res.data.data;
		},
		enabled: !!referencedTable && !!selectedDatabase,
	});

	const columns = useMemo<ColumnDef<TableRecord>[]>(
		() =>
			tableCols?.map((col) => ({
				accessorKey: col.columnName,
				header: col.columnName,
				meta: {
					variant: col.enumValues ? "enum" : col.dataType,
					isPrimaryKey: col.isPrimaryKey,
					isForeignKey: col.isForeignKey,
					referencedTable: col.referencedTable,
					referencedColumn: col.referencedColumn,
					enumValues: col.enumValues,
					dataTypeLabel: col.dataTypeLabel,
				},
				size: (col.columnName.length + (col.dataTypeLabel?.length || 0)) * 5 + 100,
				minSize: 100,
				maxSize: 500,
			})) ?? [],
		[tableCols],
	);

	const navigate = useNavigate();

	const handleNavigate = () => {
		navigate({
			to: "/table/$table",
			params: { table: referencedTable },
			search: { filters: [filter] },
		});
	};

	return (
		<>
			<DrawerHeader className="flex flex-row items-center justify-between py-3">
				<DrawerTitle>{referencedTable}</DrawerTitle>
				<Button
					variant="outline"
					size="sm"
					onClick={handleNavigate}
				>
					<ExternalLink size={14} />
					Open table
				</Button>
			</DrawerHeader>
			<div className="flex flex-1 overflow-hidden border-t">
				{isLoading ? (
					<div className="flex items-center justify-center w-full text-sm text-muted-foreground">
						<Spinner />
					</div>
				) : (
					<DataGrid
						columns={columns}
						data={tableData?.data ?? []}
					/>
				)}
			</div>
		</>
	);
};
