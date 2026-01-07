import { createFileRoute } from "@tanstack/react-router";
import { RunnerTab } from "@/components/runnr-tab/runner-tab";

export const Route = createFileRoute("/_pathlessLayout/runner/$queryId")({
	component: RouteComponent,
});

function RouteComponent() {
	const { queryId } = Route.useParams();
	return <RunnerTab queryId={queryId} />;
}
