import { useMemo } from "react";
import { TableDocumentView } from "./table-document-view";
import { TableEmptyState } from "./table-empty-state";
import { TableErrorState } from "./table-error-state";
import { TableGrid } from "./table-grid";
import { TableLoadingState } from "./table-loading-state";
import { useTableCols } from "@/features/schema";
import { useTableData } from "../hooks/use-table-data";
import { useTableModel } from "../hooks/use-table-model";
import { useDatabaseStore } from "@/stores/database.store";
import type { TableRecord } from "@/types/table.type";

export const TableTabContainer = ({ tableName }: { tableName: string }) => {
	const { dbType } = useDatabaseStore();
	const { tableData, isLoadingTableData, errorTableData } = useTableData({
		tableName,
	});
	const { tableCols, isLoadingTableCols, errorTableCols } = useTableCols({
		tableName,
	});

	const tableDataRows = useMemo<TableRecord[]>(() => tableData?.data || [], [tableData?.data]);

	const { table, selectedRows, setRowSelection } = useTableModel({
		tableName,
		tableCols,
		tableDataRows,
	});

	if (isLoadingTableData || isLoadingTableCols) {
		return <TableLoadingState />;
	}

	if (errorTableData || errorTableCols) {
		return (
			<TableErrorState
				tableName={tableName}
				errorTableData={errorTableData}
				errorTableCols={errorTableCols}
			/>
		);
	}

	const hasNoData = !tableData?.data || tableData.data.length === 0;

	if (hasNoData) {
		return (
			<TableEmptyState
				tableName={tableName}
				selectedRows={selectedRows}
				setRowSelection={setRowSelection}
			/>
		);
	}

	if (dbType === "mongodb") {
		return (
			<TableDocumentView
				tableName={tableName}
				rows={tableDataRows}
			/>
		);
	}

	return (
		<TableGrid
			table={table}
			tableName={tableName}
			selectedRows={selectedRows}
			setRowSelection={setRowSelection}
		/>
	);
};
