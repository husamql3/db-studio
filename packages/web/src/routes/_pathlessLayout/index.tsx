import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_pathlessLayout/")({
	component: RouteComponent,
});

// Key-value engines never reach this: the layout sends `/` to their home section.
function RouteComponent() {
	return (
		<main className="flex-1 flex items-center justify-center">
			Select a tab to get started
		</main>
	);
}
