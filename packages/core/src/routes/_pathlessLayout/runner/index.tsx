import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_pathlessLayout/runner/")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/_pathlessLayout/runner/"!</div>;
}
