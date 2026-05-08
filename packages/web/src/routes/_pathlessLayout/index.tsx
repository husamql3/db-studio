import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_pathlessLayout/")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="flex-1 flex items-center justify-center">
			Select a tab to get started
		</main>
	);
}
