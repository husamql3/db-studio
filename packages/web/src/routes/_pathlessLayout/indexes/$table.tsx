import { createFileRoute } from "@tanstack/react-router";
import { IndexesScreen } from "@/features/indexes";

export const Route = createFileRoute("/_pathlessLayout/indexes/$table")({
	component: RouteComponent,
});

function RouteComponent() {
	const { table } = Route.useParams();

	return (
		<main className="flex-1 flex flex-col overflow-hidden">
			<IndexesScreen tableName={table} />
		</main>
	);
}
