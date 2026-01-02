import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { IoMdHeartEmpty } from "react-icons/io";
import {
	CodeBlock,
	CodeBlockTab,
	CodeBlockTabs,
	CodeBlockTabsList,
	CodeBlockTabsTrigger,
} from "@/components/codeblock";
import { Silk } from "@/components/silk";
import { Badge } from "@/components/ui/badge";
import { Highlighter } from "@/components/ui/highlighter";

export const Route = createFileRoute("/(main)/_pathlessLayout/")({
	component: App,
});

function App() {
	return (
		<main className="flex-1 flex items-center justify-center mx-auto border-x max-w-2xl w-full">
			<div className="h-full relative w-full flex-1 flex py-4 flex-col items-center justify-center gap-4">
				<div className="relative w-full flex flex-col border-y px-3 py-6 md:px-8 md:py-10 gap-6 md:gap-10">
					<Silk
						speed={4}
						scale={1}
						color="#222222"
						noiseIntensity={0.4}
						rotation={0}
					/>

					<div className="w-full max-w-xl mx-auto">
						<div className="flex justify-center items-center mb-7 gap-2">
							<a
								href="https://github.com/husamql3/db-studio"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Badge
									variant="animated-border"
									className="w-fit"
								>
									Open Source
								</Badge>
							</a>

							<a
								href="https://github.com/sponsors/husamql3"
								target="_blank"
								rel="noopener noreferrer"
								className="group"
							>
								<Badge
									variant="rotate-border"
									className="w-fit gap-1"
								>
									<IoMdHeartEmpty className="size-3.5 text-muted-foreground group-hover:text-red-500 transition-all" />
									Sponsor
								</Badge>
							</a>
						</div>

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

					<div className="flex flex-col mx-auto max-w-lg w-full">
						<div className="flex flex-col gap-1 text-center md:text-left">
							<h1 className="font-semibold">Getting Started</h1>
							<p className="text-xs text-muted-foreground">
								Run DB Studio directly in your terminal with a single command, no
								installation required.
							</p>
						</div>

						<CodeBlockTabs
							defaultValue="npx"
							lang="bash"
						>
							<CodeBlockTabsList>
								<CodeBlockTabsTrigger value="npx">npx</CodeBlockTabsTrigger>
								<CodeBlockTabsTrigger value="yarn">Yarn</CodeBlockTabsTrigger>
								<CodeBlockTabsTrigger value="pnpm">pnpm</CodeBlockTabsTrigger>
								<CodeBlockTabsTrigger value="bun">bun</CodeBlockTabsTrigger>
							</CodeBlockTabsList>

							<CodeBlockTab value="npx">
								<CodeBlock lang="bash">npx db-studio</CodeBlock>
							</CodeBlockTab>
							<CodeBlockTab value="yarn">
								<CodeBlock lang="bash">yarn dlx db-studio</CodeBlock>
							</CodeBlockTab>
							<CodeBlockTab value="pnpm">
								<CodeBlock lang="bash">pnpm dlx db-studio</CodeBlock>
							</CodeBlockTab>
							<CodeBlockTab value="bun">
								<CodeBlock lang="bash">bunx db-studio</CodeBlock>
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
			</div>
		</main>
	);
}
