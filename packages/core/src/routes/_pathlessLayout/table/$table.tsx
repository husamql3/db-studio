import { createFileRoute } from "@tanstack/react-router";
import { AddRecordForm } from "@/components/add-table/add-record/add-record-form";
import { BulkInsertSheet } from "@/components/add-table/add-record/bulk-insert-sheet";
import { BulkInsertCsvSheet } from "@/components/add-table/add-record/bulk-insert-csv-sheet";
import { BulkInsertJsonSheet } from "@/components/add-table/add-record/bulk-insert-json-sheet";
import { BulkInsertExcelSheet } from "@/components/add-table/add-record/bulk-insert-excel-sheet";
import { TableTab } from "@/components/table-tab/table-tab";

export const Route = createFileRoute("/_pathlessLayout/table/$table")({
	component: RouteComponent,
});

function RouteComponent() {
	const { table } = Route.useParams();

	return (
		<main className="flex-1 flex flex-col overflow-hidden">
			<TableTab tableName={table} />
			<AddRecordForm tableName={table} />
			<BulkInsertSheet tableName={table} />
			<BulkInsertCsvSheet tableName={table} />
			<BulkInsertJsonSheet tableName={table} />
			<BulkInsertExcelSheet tableName={table} />
		</main>
	);
}
