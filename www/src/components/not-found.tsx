import { Link, useLocation } from "@tanstack/react-router";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/btn";

// Rendered by the root route, outside the page layout, so it brings its own header and footer.
export const NotFound = () => {
	const pathname = useLocation({ select: (location) => location.pathname });

	return (
		<div className="flex min-h-dvh w-full flex-col">
			<Header />
			<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center border-x px-5 py-24 md:px-8">
				<div className="stagger flex flex-col items-start gap-6">
					<p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						Error 404
					</p>
					<h1 className="text-2xl font-medium tracking-tight md:text-3xl">
						This page doesn't exist.
					</h1>
					<pre className="w-full max-w-xl overflow-x-auto rounded-sm border bg-white/[0.02] px-4 py-3 text-[13px] leading-relaxed">
						<code>
							<span className="text-brand-light">SELECT</span> *{" "}
							<span className="text-brand-light">FROM</span> pages{" "}
							<span className="text-brand-light">WHERE</span> path ={" "}
							<span className="text-emerald-400">'{pathname}'</span>;{"\n"}
							<span className="text-muted-foreground">-- 0 rows returned</span>
						</code>
					</pre>
					<div className="flex flex-wrap gap-2">
						<Button asChild>
							<Link to="/">Back home</Link>
						</Button>
						<Button
							asChild
							variant="outline"
						>
							<Link to="/docs/$">Read the docs</Link>
						</Button>
					</div>
				</div>
			</main>
			<Footer />
		</div>
	);
};
