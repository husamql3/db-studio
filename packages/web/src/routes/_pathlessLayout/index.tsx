import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useDatabaseStore } from "@/stores/database.store";

export const Route = createFileRoute("/_pathlessLayout/")({
	component: RouteComponent,
});

function RouteComponent() {
	const { dbType } = useDatabaseStore();
	if (dbType === "redis") return <Navigate to="/browser" />;
	return (
		<main className="flex-1 flex items-center justify-center">
			Select a tab to get started
		</main>
	);
}
