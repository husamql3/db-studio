import { useEffect, useMemo } from "react";
import { useTableCols } from "@/features/schema";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";
import type { TableRecord } from "@/types/table.type";
import { useTableData } from "../hooks/use-table-data";
import { useTableModel } from "../hooks/use-table-model";
import { useRowDetailsStore } from "../stores/row-details.store";
import { RowDetailsSheet } from "./row-details-sheet";
import { TableDocumentView } from "./table-document-view";
import { TableEmptyState } from "./table-empty-state";
import { TableErrorState } from "./table-error-state";
import { TableGrid } from "./table-grid";
import { TableLoadingState } from "./table-loading-state";

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

	// Visible-order rows for the details sheet. useReactTable keeps a stable
	// table instance (setOptions per render), so the memo must key on the
	// row-model output itself, not the table, or the sheet keeps stale rows.
	const rowModel = table.getRowModel();
	const visibleRows = useMemo(
		() => rowModel.rows.map((gridRow) => gridRow.original),
		[rowModel],
	);

	// A stale selection must never survive a table switch or unmount.
	useEffect(() => {
		return () => {
			useRowDetailsStore.getState().clearRowDetails();
			useOverlayStore.getState().closeOverlay("tables.row-details");
		};
	}, [tableName]);

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

	// if (dbType === "mongodb" || dbType === "redis") {
	if (dbType === "mongodb") {
		return (
			<TableDocumentView
				tableName={tableName}
				rows={tableDataRows}
			/>
		);
	}

	return (
		<>
			<TableGrid
				table={table}
				tableName={tableName}
				selectedRows={selectedRows}
				setRowSelection={setRowSelection}
			/>
			<RowDetailsSheet
				tableName={tableName}
				rows={visibleRows}
			/>
		</>
	);
};
