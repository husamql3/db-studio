import { createFileRoute } from "@tanstack/react-router";
import { TableScreen } from "@/features/tables";

export const Route = createFileRoute("/_pathlessLayout/table/$table")({
	component: RouteComponent,
});

function RouteComponent() {
	const { table } = Route.useParams();
	return <TableScreen tableName={table} />;
}
