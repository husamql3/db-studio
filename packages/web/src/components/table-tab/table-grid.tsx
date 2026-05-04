import { cn } from "@db-studio/ui/utils";
import type { OnChangeFn, Row, RowSelectionState, Table } from "@tanstack/react-table";
import { TableHeader } from "@/components/table-tab/header/table-header";
import { TableContainer } from "@/components/table-tab/table-container";
import { TableFooter } from "@/components/table-tab/table-footer";
import type { TableRecord } from "@/types/table.type";

export const TableGrid = ({
	table,
	tableName,
	selectedRows,
	setRowSelection,
}: {
	table: Table<TableRecord>;
	tableName: string;
	selectedRows: Row<TableRecord>[];
	setRowSelection: OnChangeFn<RowSelectionState>;
}) => (
	<div className={cn("flex-1 w-full flex flex-col overflow-hidden pb-9")}>
		<TableHeader
			selectedRows={selectedRows}
			setRowSelection={setRowSelection}
			tableName={tableName}
		/>
		<TableContainer table={table} />
		<TableFooter tableName={tableName} />
	</div>
);
