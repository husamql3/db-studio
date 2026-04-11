import { createFileRoute } from "@tanstack/react-router";
import { SchemaTab } from "@/components/schema-tab/schema-tab";

export const Route = createFileRoute("/_pathlessLayout/schema/$table")({
	component: RouteComponent,
});

function RouteComponent() {
	const { table } = Route.useParams();

	return (
		<main className="flex-1 flex flex-col overflow-hidden">
			<SchemaTab tableName={table} />
		</main>
	);
}
