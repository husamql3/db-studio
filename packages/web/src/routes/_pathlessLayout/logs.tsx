import { createFileRoute } from "@tanstack/react-router";
import { LogsScreen } from "@/features/logs";

export const Route = createFileRoute("/_pathlessLayout/logs")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="flex-1 overflow-hidden">
			<LogsScreen />
		</main>
	);
}
