import { META } from "@db-studio/shared/constants";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { SectionHeader } from "@/components/section";
import { Button } from "@/components/ui/btn";
import { enginePages } from "@/lib/content/engine-pages";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/(main)/_pathlessLayout/{$engine}-gui")({
	component: RouteComponent,
	loader: ({ params }) => {
		const page = enginePages.find((p) => p.slug === params.engine);

		if (!page) throw notFound();

		return page;
	},
	head: ({ loaderData, params }) =>
		loaderData
			? {
					...seoHead({
						title: loaderData.title,
						description: loaderData.description,
						path: `/${params.engine}-gui`,
					}),
					scripts: [
						{
							type: "application/ld+json",
							children: JSON.stringify({
								"@context": "https://schema.org",
								"@type": "FAQPage",
								mainEntity: loaderData.faq.map(({ question, answer }) => ({
									"@type": "Question",
									name: question,
									acceptedAnswer: { "@type": "Answer", text: answer },
								})),
							}),
						},
					],
				}
			: {},
});

function RouteComponent() {
	const page = Route.useLoaderData();
	const others = enginePages.filter((p) => p.slug !== page.slug);

	return (
		<main className="mx-auto w-full max-w-5xl flex-1 border-x">
			<SectionHeader
				level={1}
				eyebrow={`${page.name} GUI`}
				title={page.headline}
				description={page.intro}
				className="pt-16 md:pt-24"
			/>

			<div className="flex flex-col items-start gap-4 px-5 pb-14 md:px-8">
				<pre className="w-full max-w-2xl overflow-x-auto rounded-sm border bg-white/[0.02] px-4 py-3 text-sm">
					<code>
						<span className="select-none text-muted-foreground">$ </span>
						{page.command}
					</code>
				</pre>
				<div className="flex flex-wrap gap-2">
					<Button asChild>
						<Link
							to="/docs/$"
							params={{ _splat: "getting-started" }}
						>
							Get started
						</Link>
					</Button>
					<Button
						asChild
						variant="outline"
					>
						<a href={`${META.SITE_GITHUB_LINK}/releases/latest`}>Download the desktop app</a>
					</Button>
				</div>
			</div>

			<section className="border-t">
				<SectionHeader
					eyebrow="Features"
					title={`What you can do with ${page.name}`}
				/>
				<ul className="grid gap-px border-t bg-border sm:grid-cols-2 lg:grid-cols-3">
					{page.highlights.map(({ title, text }) => (
						<li
							key={title}
							className="flex flex-col gap-1.5 bg-background px-5 py-6 md:px-8"
						>
							<h3 className="text-sm font-medium">{title}</h3>
							<p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
								{text}
							</p>
						</li>
					))}
				</ul>
			</section>

			<section className="border-t">
				<SectionHeader
					eyebrow="Limits"
					title="Good to know"
					description={
						<>
							What works differently on {page.name}. Full details in the{" "}
							<Link
								to="/docs/$"
								params={{ _splat: "databases" }}
								hash={page.slug}
								className="text-foreground underline underline-offset-4"
							>
								{page.name} docs
							</Link>
							.
						</>
					}
				/>
				<ul className="flex max-w-2xl flex-col gap-2 px-5 pb-10 text-[13px] leading-relaxed text-foreground/85 md:px-8">
					{page.limits.map((limit) => (
						<li
							key={limit}
							className="relative pl-4 text-pretty before:absolute before:left-0 before:text-muted-foreground/60 before:content-['–']"
						>
							{limit}
						</li>
					))}
				</ul>
			</section>

			<section className="border-t">
				<SectionHeader
					eyebrow="FAQ"
					title="Questions"
				/>
				<dl className="flex max-w-2xl flex-col gap-6 px-5 pb-10 md:px-8">
					{page.faq.map(({ question, answer }) => (
						<div
							key={question}
							className="flex flex-col gap-1.5"
						>
							<dt className="text-sm font-medium">{question}</dt>
							<dd className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
								{answer}
							</dd>
						</div>
					))}
				</dl>
			</section>

			{others.length > 0 && (
				<section className="border-t">
					<SectionHeader
						eyebrow="More engines"
						title="One studio for every database"
					/>
					<ul className="flex flex-wrap gap-2 px-5 pb-10 md:px-8">
						{others.map((other) => (
							<li key={other.slug}>
								<Link
									to="/{$engine}-gui"
									params={{ engine: other.slug }}
									className="group inline-flex h-8 items-center gap-1.5 rounded-sm border px-3 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
								>
									{other.name} GUI
									<ArrowRightIcon className="size-3 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
		</main>
	);
}
