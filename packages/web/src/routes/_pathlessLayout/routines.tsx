import { createFileRoute } from "@tanstack/react-router";
import { RoutinesScreen } from "@/features/routines";

export const Route = createFileRoute("/_pathlessLayout/routines")({
	validateSearch: (
		search: Record<string, unknown>,
	): { routine?: string; schema?: string; signature?: string; type?: string } => ({
		routine: typeof search.routine === "string" ? search.routine : undefined,
		schema: typeof search.schema === "string" ? search.schema : undefined,
		signature: typeof search.signature === "string" ? search.signature : undefined,
		type: typeof search.type === "string" ? search.type : undefined,
	}),
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="flex-1 overflow-hidden">
			<RoutinesScreen />
		</main>
	);
}
