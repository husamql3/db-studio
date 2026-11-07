import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export const Route = createFileRoute("/(main)/_pathlessLayout")({
	component: RouteComponent,
});

// A div, not <main>: each page renders its own <main>.
function RouteComponent() {
	return (
		<div className="relative flex min-h-dvh w-full flex-col">
			<Header />
			<Outlet />
			<Footer />
		</div>
	);
}
