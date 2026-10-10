import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_pathlessLayout/indexes/")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="flex-1 flex items-center justify-center">
			Select a table to view its indexes
		</main>
	);
}
