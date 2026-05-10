import { createFileRoute } from "@tanstack/react-router";
import { RunnerScreen } from "@/features/query-runner";

export const Route = createFileRoute("/_pathlessLayout/runner/")({
	component: RouteComponent,
});

function RouteComponent() {
	return <RunnerScreen />;
}
