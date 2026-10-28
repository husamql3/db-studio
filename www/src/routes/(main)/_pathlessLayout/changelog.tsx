import { createFileRoute } from "@tanstack/react-router";
import { Image } from "fumadocs-core/framework";
import { SectionHeader } from "@/components/section";
import { type ChangelogItem, changelog } from "@/lib/content/changelog";
import { seoHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/(main)/_pathlessLayout/changelog")({
	component: RouteComponent,
	head: () =>
		seoHead({
			title: "Changelog – dbstudio",
			description: "Release notes for dbstudio: new features, improvements, and bug fixes.",
			path: "/changelog",
		}),
});

const GROUPS = [
	{ key: "features", label: "Features", dot: "bg-emerald-400" },
	{ key: "improvements", label: "Improvements", dot: "bg-brand-light" },
	{ key: "bugsFixed", label: "Fixes", dot: "bg-amber-400" },
] as const;

function Usernames({ username }: { username?: string | string[] }) {
	if (!username) return null;
	const usernames = Array.isArray(username) ? username : [username];
	return (
		<span className="text-muted-foreground/70">
			{" — "}
			{usernames.map((user, index) => (
				<span key={user}>
					<a
						href={`https://github.com/${user}`}
						target="_blank"
						rel="noopener noreferrer"
						className="underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
					>
						@{user}
					</a>
					{index < usernames.length - 1 && ", "}
				</span>
			))}
		</span>
	);
}

function RouteComponent() {
	return (
		<main className="mx-auto w-full max-w-5xl flex-1 border-x">
			<SectionHeader
				level={1}
				eyebrow="Changelog"
				title="What's new in db-studio"
				description="New features, improvements, and fixes in every release."
				className="pb-10"
			/>

			<ol className="border-t">
				{changelog.map((item: ChangelogItem, index) => (
					<li
						key={item.version}
						id={`v${item.version}`}
						className="grid scroll-mt-14 gap-4 border-b px-5 py-10 last:border-b-0 md:grid-cols-[180px_1fr] md:gap-8 md:px-8"
					>
						<div className="flex items-center gap-3 md:sticky md:top-24 md:flex-col md:items-start md:self-start md:gap-1.5">
							<a
								href={`#v${item.version}`}
								className="flex items-center gap-2 text-sm font-medium tabular-nums transition-colors duration-150 hover:text-brand-light"
							>
								v{item.version}
								{index === 0 && (
									<span className="rounded-[3px] bg-brand/20 px-1.5 py-0.5 text-[10px] font-normal text-brand-light">
										Latest
									</span>
								)}
							</a>
							<time
								dateTime={item.date}
								className="text-xs text-muted-foreground"
							>
								{/* timeZone UTC: the date string is a calendar day, not a moment. */}
								{new Date(item.date).toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
									year: "numeric",
									timeZone: "UTC",
								})}
							</time>
						</div>

						<article className="flex max-w-2xl flex-col gap-6">
							<div className="flex flex-col gap-2">
								{item.tags && item.tags.length > 0 && (
									<div className="flex gap-1">
										{item.tags.map((tag) => (
											<span
												key={tag}
												className="rounded-[3px] border px-1.5 py-0.5 text-[10px] text-muted-foreground"
											>
												{tag}
											</span>
										))}
									</div>
								)}
								<h2 className="text-lg font-medium tracking-tight text-balance">
									{item.title}
								</h2>
							</div>

							{item.image && (
								<Image
									src={item.image}
									alt={item.title}
									width={1000}
									height={1000}
									className="h-48 w-full rounded-sm border object-cover"
								/>
							)}

							{GROUPS.map(({ key, label, dot }) => {
								const entries = item[key];
								if (!entries?.length) return null;
								return (
									<section
										key={key}
										className="flex flex-col gap-2.5"
									>
										<h3 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
											<span className={cn("size-1.5 rounded-full", dot)} />
											{label}
										</h3>
										<ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-foreground/85">
											{entries.map((entry) => (
												<li
													key={entry.text}
													className="relative pl-4 text-pretty before:absolute before:left-0 before:text-muted-foreground/60 before:content-['–']"
												>
													{entry.text}
													<Usernames username={entry.username} />
												</li>
											))}
										</ul>
									</section>
								);
							})}
						</article>
					</li>
				))}
			</ol>
		</main>
	);
}
