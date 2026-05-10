import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_pathlessLayout/logs")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="flex-1 flex items-center justify-center">
			Logs will be available soon!
		</main>
	);
}
