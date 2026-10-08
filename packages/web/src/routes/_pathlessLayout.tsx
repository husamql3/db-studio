import { createFileRoute, Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { Header } from "@/components/components/header";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const Route = createFileRoute("/_pathlessLayout")({
	component: RouteComponent,
});

function RouteComponent() {
	const isKeyValue = useDatabaseEngine()?.dataModel === "key-value";
	const { pathname } = useLocation();
	const section = pathname.split("/")[1];
	const {
		sidebar: { isPinned, width },
	} = usePersonalPreferencesStore();
	if (isKeyValue && section !== "browser" && section !== "runner") {
		return <Navigate to="/browser" />;
	}
	if (!isKeyValue && section === "browser") {
		return <Navigate to="/" />;
	}

	return (
		<div className="bg-background text-foreground w-dvw flex h-dvh max-h-dvh overflow-hidden relative">
			<Sidebar />

			<div
				className="flex-1 flex flex-col h-full overflow-hidden "
				style={{
					marginLeft: isPinned ? `${width}px` : "0",
				}}
			>
				<Header />
				<Outlet />
			</div>
		</div>
	);
}
