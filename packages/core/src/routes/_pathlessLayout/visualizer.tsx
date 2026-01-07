import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_pathlessLayout/visualizer")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="flex-1 flex items-center justify-center">
			Visualizer will be available soon!
		</main>
	);
}
