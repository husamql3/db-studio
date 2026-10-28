import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useDatabaseEngine } from "@/hooks/use-database-engine";

export const Route = createFileRoute("/_pathlessLayout/")({
	component: RouteComponent,
});

function RouteComponent() {
	if (useDatabaseEngine()?.dataModel === "key-value") return <Navigate to="/browser" />;
	return (
		<main className="flex-1 flex items-center justify-center">
			Select a tab to get started
		</main>
	);
}
