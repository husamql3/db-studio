import { createFileRoute } from "@tanstack/react-router";
import { Image } from "fumadocs-core/framework";
import { PlusIcon } from "lucide-react";
import { type ChangelogItem, changelog } from "@/lib/content/changelog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/(main)/_pathlessLayout/changelog")({
	component: RouteComponent,
});

function UsernameBadge({ username }: { username?: string | string[] }) {
	if (!username) return null;

	const usernames = Array.isArray(username) ? username : [username];

	return (
		<>
			{" - "}
			{usernames.map((user, index) => (
				<span key={user}>
					<a
						href={`https://github.com/${user}`}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-blue-600 group"
					>
						<span className="text-xs font-medium">@{user}</span>
					</a>
					{index < usernames.length - 1 && ", "}
				</span>
			))}
		</>
	);
}

function RouteComponent() {
	return (
		<main className="flex-1 mx-auto border-x max-w-2xl w-full">
			<div className="relative px-6 max-w-xl mx-auto py-6 md:py-12">
				<div className="relative">
					<div className="absolute left-[123px] top-0 bottom-0 w-px bg-border hidden md:block" />

					{changelog.map((item: ChangelogItem, index: number) => (
						<div
							key={index}
							className="relative md:grid md:grid-cols-[100px_1fr] md:gap-6 pb-10 last:pb-0"
						>
							<div className="flex flex-row md:flex-col gap-2 mb-3 md:mb-0 md:sticky md:top-4 md:self-start md:text-right">
								<div className="text-[10px] text-muted-foreground order-2 md:order-1 flex items-center">
									{new Date(item.date).toLocaleDateString("en-US", {
										month: "short",
										day: "numeric",
										year: "numeric",
									})}
								</div>

								<div className="order-1 md:order-2 w-fit text-zinc-50 px-2 py-1 rounded-sm text-sm font-medium border border-zinc-800">
									v{item.version}
								</div>
							</div>

							<div className="relative md:pl-6">
								{/* Plus Icon on timeline - hidden on mobile */}
								<div className="absolute -left-3 top-0 bg-background hidden md:block">
									<PlusIcon
										className="h-6 w-6"
										strokeWidth={1}
									/>
								</div>

								{/* Content Card */}
								<div className="space-y-3">
									<div className="flex flex-col-reverse gap-3">
										<h3 className="text-lg font-semibold">{item.title}</h3>

										<div className="flex gap-1">
											{item.tags &&
												item.tags.length > 0 &&
												item.tags.map((tag: string, tagIndex: number) => (
													<span
														key={`${item.title}-${tag}-${tagIndex}`}
														className={cn(
															"w-fit items-center bg-zinc-900 px-2 py-0.5 rounded-full text-[10px] font-medium border",
														)}
													>
														{tag}
													</span>
												))}
										</div>
									</div>

									{item.image && (
										<div className="w-full h-48 rounded-md">
											<Image
												src={item.image || "/placeholder.svg"}
												alt={item.title}
												width={1000}
												height={1000}
												className="w-full h-full object-cover"
											/>
										</div>
									)}

									<div className="space-y-4 text-sm text-muted-foreground">
										{item.features && item.features.length > 0 && (
											<div className="space-y-1.5">
												<h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/70">
													🚀 Features
												</h4>
												<ul className="space-y-1">
													{item.features.map((feature, featureIndex: number) => (
														<li
															key={`${item.title}-feature-${featureIndex}`}
															className="flex items-start gap-2"
														>
															<span className="flex-1">
																• {feature.text}
																<UsernameBadge username={feature.username} />
															</span>
														</li>
													))}
												</ul>
											</div>
										)}

										{item.improvements && item.improvements.length > 0 && (
											<div className="space-y-1.5">
												<h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/70">
													🔧 Improvements
												</h4>
												<ul className="space-y-1">
													{item.improvements.map((improvement, improvementIndex: number) => (
														<li
															key={`${item.title}-improvement-${improvementIndex}`}
															className="flex items-start gap-2"
														>
															<span className="flex-1">
																• {improvement.text}
																<UsernameBadge username={improvement.username} />
															</span>
														</li>
													))}
												</ul>
											</div>
										)}

										{item.bugsFixed && item.bugsFixed.length > 0 && (
											<div className="space-y-1.5">
												<h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/70">
													🐛 Bug Fixes
												</h4>
												<ul className="space-y-1">
													{item.bugsFixed.map((bug, bugIndex: number) => (
														<li
															key={`${item.title}-bug-${bugIndex}`}
															className="flex items-start gap-2"
														>
															<span className="flex-1">
																• {bug.text}
																<UsernameBadge username={bug.username} />
															</span>
														</li>
													))}
												</ul>
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</main>
	);
}
