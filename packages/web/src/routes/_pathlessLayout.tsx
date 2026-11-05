import { createFileRoute, Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { NavRail } from "@/components/components/nav-rail";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { homePath, sectionOf } from "@/lib/sections";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const Route = createFileRoute("/_pathlessLayout")({
	component: RouteComponent,
});

function RouteComponent() {
	const engine = useDatabaseEngine();
	const { pathname } = useLocation();
	const section = sectionOf(pathname);

	const {
		sidebar: { isPinned, width },
	} = usePersonalPreferencesStore();

	if (engine && section && !section.appliesTo(engine)) {
		return <Navigate to={homePath(engine)} />;
	}

	const hasSidebar = Boolean(section?.sidebar);

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
