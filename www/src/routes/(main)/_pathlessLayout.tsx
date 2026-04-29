import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RocketIcon, XIcon } from "lucide-react";
import { useState } from "react";
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

function ProductHuntBanner() {
	const [dismissed, setDismissed] = useState(false);

	if (dismissed) return null;

	return (
		<div className="w-full bg-[#4B70FF] text-white text-sm flex items-center justify-center gap-3 px-4 py-2.5 relative">
			<RocketIcon className="h-4 w-4 shrink-0" />
			<span>
				We&apos;re live on Product Hunt! If you&apos;re enjoying db-studio, support us with an
				upvote.
			</span>
			<a
				href="https://www.producthunt.com/products/dbstudio-sh/launches/dbstudio-sh"
				target="_blank"
				rel="noopener noreferrer"
				className="shrink-0 rounded border border-white/60 px-2.5 py-0.5 text-xs font-medium hover:bg-white/10 transition-colors"
			>
				Upvote us!
			</a>
			<button
				type="button"
				onClick={() => setDismissed(true)}
				className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
				aria-label="Dismiss banner"
			>
				<XIcon className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}

function RouteComponent() {
	const { stars } = Route.useLoaderData();
	return (
		<main className="relative min-h-dvh w-full flex flex-col h-full z-10">
			<ProductHuntBanner />
			<div className="px-4 md:px-0 flex flex-col flex-1">
				<Header stars={stars} />
				<Outlet />
				<Footer />
			</div>
		</main>
	);
}
