import { createFileRoute } from "@tanstack/react-router";
import { SchemaScreen } from "@/features/schema";

export const Route = createFileRoute("/_pathlessLayout/schema/$table")({
	component: RouteComponent,
});

function RouteComponent() {
	const { table } = Route.useParams();

	return (
		<main className="flex-1 flex flex-col overflow-hidden">
			<SchemaScreen tableName={table} />
		</main>
	);
}
