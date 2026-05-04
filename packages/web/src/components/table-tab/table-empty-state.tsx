import type { OnChangeFn, Row, RowSelectionState } from "@tanstack/react-table";
import { TableHeader } from "@/components/table-tab/header/table-header";
import type { TableRecord } from "@/types/table.type";

export const TableEmptyState = ({
	tableName,
	selectedRows,
	setRowSelection,
}: {
	tableName: string;
	selectedRows: Row<TableRecord>[];
	setRowSelection: OnChangeFn<RowSelectionState>;
}) => (
	<div className="size-full flex flex-col items-center justify-center">
		<TableHeader
			selectedRows={selectedRows}
			setRowSelection={setRowSelection}
			tableName={tableName}
		/>
		<div className="text-sm text-muted-foreground flex-1 flex items-center justify-center">
			No data available for "{tableName}" table
		</div>
	</div>
);
