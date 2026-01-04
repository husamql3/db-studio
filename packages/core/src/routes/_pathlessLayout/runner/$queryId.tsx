import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_pathlessLayout/runner/$queryId")({
	component: RouteComponent,
});

function RouteComponent() {
	const { queryId } = Route.useParams();
	return <div>Hello "/_pathlessLayout/runner/{queryId}"!</div>;
}
