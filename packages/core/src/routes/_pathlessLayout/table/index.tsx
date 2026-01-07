import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_pathlessLayout/table/")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="flex-1 flex items-center justify-center">
			Select a table to view data
		</div>
	);
}
