import { createFileRoute } from "@tanstack/react-router";
import { RunnerTab } from "@/components/runnr-tab/runner-tab";

export const Route = createFileRoute("/_pathlessLayout/runner/")({
	component: RouteComponent,
});

function RouteComponent() {
	return <RunnerTab />;
}
