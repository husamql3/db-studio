import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { getStarsCount } from "@/utils/get-stars-count";

export const Route = createFileRoute("/(main)/_pathlessLayout")({
	component: RouteComponent,
	loader: async () => {
		const stars = await getStarsCount();
		return { stars };
	},
});

function RouteComponent() {
	const { stars } = Route.useLoaderData();
	return (
		<main className="relative min-h-dvh w-full flex flex-col h-full z-10 px-4 md:px-0">
			<Header stars={stars} />
			<Outlet />
			<Footer />
		</main>
	);
}
