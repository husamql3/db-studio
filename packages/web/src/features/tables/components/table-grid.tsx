import { cn } from "@db-studio/ui/utils";
import type { OnChangeFn, Row, RowSelectionState, Table } from "@tanstack/react-table";
import type { TableRecord } from "@/types/table.type";
import { TableHeader } from "./header/table-header";
import { TableContainer } from "./table-container";
import { TableFooter } from "./table-footer";

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
