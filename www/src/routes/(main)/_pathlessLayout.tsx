import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export const Route = createFileRoute("/(main)/_pathlessLayout")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="relative min-h-dvh w-full flex flex-col h-full z-10">
			<div className="px-4 md:px-0 flex flex-col flex-1">
				<Header />
				<Outlet />
				<Footer />
			</div>
		</main>
	);
}
