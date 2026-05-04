import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Header } from "@/components/components/header";
import { Sidebar } from "@/components/sidebar/sidebar";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const Route = createFileRoute("/_pathlessLayout")({
	component: RouteComponent,
});

function RouteComponent() {
	const {
		sidebar: { isPinned, width },
	} = usePersonalPreferencesStore();

	return (
		<div className="bg-zinc-950 w-dvw flex h-dvh max-h-dvh overflow-hidden relative">
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
