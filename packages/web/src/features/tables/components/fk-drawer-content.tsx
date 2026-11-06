import type { FilterType } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import { DataGrid } from "@db-studio/ui/data-grid";
import { DrawerHeader, DrawerTitle } from "@db-studio/ui/drawer";
import { Spinner } from "@db-studio/ui/spinner";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { CopyButton } from "@/components/copy-button";
import type { TableRecord } from "@/features/tables/table.type";
import { useTableCols } from "@/hooks/use-table-cols";
import { useTableData } from "@/hooks/use-table-data";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { CONSTANTS } from "@/utils/constants";
import { formatCellValue } from "@/utils/format-cell-value";
import { toColumnDef } from "../utils/column-def";

export const FkDrawerContent = ({
	referencedTable,
	referencedColumn,
	fkValue,
}: {
	referencedTable: string;
	referencedColumn: string;
	fkValue: string;
}) => {
	// An FK references a table in its own schema, the open table's.
	const schemaName = useTableSchemaName();
	const { tableCols } = useTableCols({ tableName: referencedTable, schemaName });

	const filter: FilterType = { columnName: referencedColumn, operator: "=", value: fkValue };

	const { tableData, isLoadingTableData } = useTableData({
		tableName: referencedTable,
		schemaName,
		cursor: null,
		direction: null,
		limit: null,
		sort: null,
		order: null,
		filters: [filter],
	});

	const columns = useMemo<ColumnDef<TableRecord>[]>(
		() => tableCols?.map((col) => toColumnDef(col)) ?? [],
		[tableCols],
	);

	const navigate = useNavigate();

	const handleNavigate = () => {
		navigate({
			to: "/table/$table",
			params: { table: referencedTable },
			search: { filters: [filter], [CONSTANTS.TABLE_SCHEMA]: schemaName },
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
				{isLoadingTableData ? (
					<div className="flex items-center justify-center w-full text-sm text-muted-foreground">
						<Spinner />
					</div>
				) : (
					<DataGrid
						columns={columns}
						data={tableData?.data ?? []}
						renderCellAccessory={(value) => <CopyButton value={formatCellValue(value)} />}
					/>
				)}
			</div>
		</>
	);
};
