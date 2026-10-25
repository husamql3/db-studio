// PROTOTYPE — throwaway route for the migrations UI prototype. Lives on prototype/schema-diff.
import { createFileRoute } from "@tanstack/react-router";
import { SchemaDiffPrototypeScreen } from "@/features/schema-diff-prototype";

const pick = (search: Record<string, unknown>, key: string) =>
	typeof search[key] === "string" ? { [key]: search[key] } : {};

export const Route = createFileRoute("/_pathlessLayout/migrations")({
	validateSearch: (
		search: Record<string, unknown>,
	): { view?: string; migration?: string; graph?: string } => ({
		...pick(search, "view"),
		...pick(search, "migration"),
		...pick(search, "graph"),
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const { view = "prisma", migration, graph = "timeline" } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<main className="flex-1 overflow-hidden">
			<SchemaDiffPrototypeScreen
				view={view}
				migrationId={migration}
				graph={graph}
				onGraph={(key) =>
					navigate({ search: (prev) => ({ ...prev, graph: key }), replace: true })
				}
			/>
		</main>
	);
}
