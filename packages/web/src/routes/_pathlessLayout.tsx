import { createFileRoute, Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { NavRail } from "@/components/components/nav-rail";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const Route = createFileRoute("/_pathlessLayout")({
	component: RouteComponent,
});

function RouteComponent() {
	const engine = useDatabaseEngine();
	const isKeyValue = engine?.dataModel === "key-value";
	const { pathname } = useLocation();
	const section = pathname.split("/")[1];
	const {
		sidebar: { isPinned, width },
	} = usePersonalPreferencesStore();
	if (isKeyValue && section !== "browser" && section !== "runner" && section !== "logs") {
		return <Navigate to="/browser" />;
	}
	if (!isKeyValue && section === "browser") {
		return <Navigate to="/" />;
	}
	if (engine && !engine.indexes && section === "indexes") {
		return <Navigate to="/table" />;
	}
	if (engine && !engine.serverLogs && section === "logs") {
		return <Navigate to="/table" />;
	}

	// The visualizer canvas uses the full width; it has no table list.
	const hasSidebar = section !== "visualizer";

	return (
		<div className="bg-background text-foreground w-dvw flex h-dvh max-h-dvh overflow-hidden relative">
			<NavRail />
			{hasSidebar && <Sidebar />}

			<div
				className="rail-content relative flex-1 flex flex-col h-full overflow-hidden"
				style={{
					marginLeft: hasSidebar && isPinned ? `${width}px` : "0",
				}}
			>
				<Outlet />
			</div>
		</div>
	);
}
