import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import {
	CodeBlock,
	CodeBlockTab,
	CodeBlockTabs,
	CodeBlockTabsList,
	CodeBlockTabsTrigger,
} from "@/components/codeblock";
import { ContributorsGrid } from "@/components/contributors";
import { FeaturesGrid } from "@/components/features";
import { Highlighter } from "@/components/ui/highlighter";
import { cn } from "@/lib/utils";
import { getContributors } from "@/utils/get-contributors";

export const Route = createFileRoute("/(main)/_pathlessLayout/")({
	component: App,
	loader: async () => {
		const contributors = await getContributors();
		return { contributors };
	},
});

function App() {
	const { contributors } = Route.useLoaderData();
	return (
		<main className="flex-1 flex items-center justify-center mx-auto border-x max-w-2xl w-full">
			<div className="h-full relative w-full flex-1 flex py-4 flex-col items-center justify-center my-16 gap-16">
				<div className="relative w-full flex flex-col border-y px-3 py-6 md:px-8 md:py-10 gap-6 md:gap-10">
					{/* X Faded Borders & Shades */}
					<div
						aria-hidden="true"
						className="absolute inset-0 -z-1 size-full overflow-hidden"
					>
						<div
							className={cn(
								"absolute -inset-x-20 inset-y-0 z-0 rounded-full",
								"bg-[radial-gradient(ellipse_at_center,theme(--color-foreground/.1),transparent,transparent)]",
								"blur-[50px]",
							)}
						/>
						<div className="absolute inset-y-0 left-4 w-px bg-linear-to-b from-transparent via-border to-border md:left-8" />
						<div className="absolute inset-y-0 right-4 w-px bg-linear-to-b from-transparent via-border to-border md:right-8" />
						<div className="absolute inset-y-0 left-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:left-12" />
						<div className="absolute inset-y-0 right-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:right-12" />
					</div>

					<div className="w-full max-w-xl mx-auto">
						<p className="text-center md:text-xl font-bold">
							A modern (pgAdmin alternative but good)
							<Highlighter
								action="highlight"
								color="oklch(0.488 0.243 264.376)"
							>
								database management studio
							</Highlighter>
							for any database
						</p>
					</div>

					<div className="flex flex-col mx-auto max-w-md sm:max-w-lg w-full">
						<div className="flex flex-col gap-1 text-center md:text-left">
							<h1 className="font-semibold">Getting Started</h1>
							<p className="text-xs text-muted-foreground">
								Launch instantly from your terminal—no installation needed.
							</p>
						</div>

						<CodeBlockTabs
							defaultValue="npx"
							lang="bash"
						>
							<CodeBlockTabsList>
								<CodeBlockTabsTrigger
									className="text-xs"
									value="npx"
								>
									npx
								</CodeBlockTabsTrigger>
								<CodeBlockTabsTrigger
									className="text-xs"
									value="yarn"
								>
									Yarn
								</CodeBlockTabsTrigger>
								<CodeBlockTabsTrigger
									className="text-xs"
									value="pnpm"
								>
									pnpm
								</CodeBlockTabsTrigger>
								<CodeBlockTabsTrigger
									className="text-xs"
									value="bun"
								>
									bun
								</CodeBlockTabsTrigger>
							</CodeBlockTabsList>

							<CodeBlockTab value="npx">
								<CodeBlock
									className="text-xs"
									lang="bash"
								>
									<pre>
										<code>npx db-studio</code>
									</pre>
								</CodeBlock>
							</CodeBlockTab>
							<CodeBlockTab value="yarn">
								<CodeBlock
									className="text-xs"
									lang="bash"
								>
									<pre>
										<code>yarn dlx db-studio</code>
									</pre>
								</CodeBlock>
							</CodeBlockTab>
							<CodeBlockTab value="pnpm">
								<CodeBlock
									className="text-xs"
									lang="bash"
								>
									<pre>
										<code>pnpm dlx db-studio</code>
									</pre>
								</CodeBlock>
							</CodeBlockTab>
							<CodeBlockTab value="bun">
								<CodeBlock
									className="text-xs"
									lang="bash"
								>
									<pre>
										<code>bunx db-studio</code>
									</pre>
								</CodeBlock>
							</CodeBlockTab>
						</CodeBlockTabs>
					</div>

					<PlusIcon
						className="-top-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -top-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-bottom-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -bottom-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
				</div>

				<div className="relative w-full flex flex-col border-y">
					<img
						src="/studio.png"
						alt="DB Studio"
						width={1000}
						height={1000}
						className="w-full h-full object-contain"
					/>

					<PlusIcon
						className="-top-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -top-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-bottom-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -bottom-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
				</div>

				{/* <div className="relative w-full flex flex-col border-y">
					<h2 className="py-6 text-center font-medium text-lg text-muted-foreground tracking-tight md:text-xl">
						Trusted by <span className="text-foreground">our partners</span>
					</h2>

					<LogoCloud />

					<PlusIcon
						className="-top-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -top-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-bottom-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -bottom-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
				</div> */}

				<div className="relative w-full flex flex-col border-y">
					<h2 className="py-6 text-center font-medium text-lg text-muted-foreground tracking-tight md:text-xl">
						Everything you need to{" "}
						<span className="text-foreground">manage your database</span>
					</h2>

					<FeaturesGrid />

					<PlusIcon
						className="-top-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -top-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-bottom-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -bottom-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
				</div>

				<div className="relative w-full flex flex-col border-y">
					<div className="flex flex-col items-center gap-3 px-4 py-8 md:px-8 text-center">
						<h2 className="font-medium text-lg text-muted-foreground tracking-tight md:text-xl">
							Open for <span className="text-foreground">sponsorship</span>
						</h2>
						<p className="text-xs text-muted-foreground max-w-sm">
							Help us keep db-studio free and actively maintained. If you or your company find
							it useful, consider supporting the project.
						</p>
						<a
							href="mailto:contact@ql3.dev"
							className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 underline underline-offset-4"
						>
							contact@ql3.dev
						</a>
					</div>

					<PlusIcon
						className="-top-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -top-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-bottom-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -bottom-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
				</div>

				<div className="relative w-full flex flex-col border-y">
					<h2 className="py-6 text-center font-medium text-lg text-muted-foreground tracking-tight md:text-xl">
						Shoutout to our <span className="text-foreground">contributors</span>
					</h2>

					<ContributorsGrid contributors={contributors} />

					<PlusIcon
						className="-top-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -top-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-bottom-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -bottom-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
				</div>
			</div>
		</main>
	);
}
