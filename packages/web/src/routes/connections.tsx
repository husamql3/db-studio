import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ConnectionsScreen } from "@/features/connections";
import { isDesktop } from "@/lib/desktop";

export const Route = createFileRoute("/connections")({
	component: RouteComponent,
});

function RouteComponent() {
	// Saved connections only exist in the desktop app; the CLI is configured by flags and .env.
	if (!isDesktop) return <Navigate to="/" />;
	return <ConnectionsScreen />;
}
