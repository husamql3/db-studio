import { createFileRoute } from "@tanstack/react-router";
import { AddRecordForm } from "@/components/add-table/add-record/add-record-form";
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
		</main>
	);
}
