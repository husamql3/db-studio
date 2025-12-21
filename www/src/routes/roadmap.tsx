import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckIcon, PlusIcon } from "lucide-react";
import { IoLogoGithub } from "react-icons/io";

import { Button } from "@/components/ui/button";
import { getStarsCount } from "@/utils/get-stars-count";

export const Route = createFileRoute("/roadmap")({
	component: RouteComponent,
	loader: async () => {
		const stars = await getStarsCount();
		return { stars };
	},
});

const roadmapItems = [
	{
		title: "Foundation",
		status: "completed",
		items: [
			"Core database connection handling with psql",
			"Table structure visualization",
			"Initial UI/UX design system",
			"Filtering & sorting & creating a new table & new record",
		],
	},
	{
		title: "Core Tabs Implementation",
		status: "in-progress",
		items: [
			"SQL Runner tab with editor, execution, and result grid",
			"Indexes tab (list, create, edit, drop)",
			"Visualizer tab (interactive ER diagram)",
			"Schema tab (views, functions, triggers, extensions)",
		],
	},
	{
		title: "Enhanced Data & Table Management",
		status: "in-progress",
		items: [
			"Advanced grid features (bulk edit, import/export, FK navigation)",
			"Edit existing tables & constraints",
			"Support for additional constraints (CHECK, UNIQUE)",
		],
	},
	{
		title: "Advanced Features",
		status: "planned",
		items: [
			"User & role management",
			"Monitoring & server stats",
			"Basic backup/restore tools",
			"Query performance insights",
		],
	},
	{
		title: "Multi-Database & Extensibility",
		status: "planned",
		items: [
			"Multiple connections management",
			"Support for MySQL/MariaDB and SQLite",
			"Broader DBMS adapters",
			"Visual query builder & schema comparison",
		],
	},
];

function getStatusStyles(status: string) {
	switch (status) {
		case "completed":
			return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
		case "in-progress":
			return "bg-[#1447e6]/10 text-[#1447e6] border-[#1447e6]/30";
		case "planned":
			return "bg-amber-500/10 text-amber-600 border-amber-500/30";
		default:
			return "bg-muted text-muted-foreground border-border";
	}
}

function getStatusLabel(status: string) {
	switch (status) {
		case "completed":
			return "Completed";
		case "in-progress":
			return "In Progress";
		case "planned":
			return "Planned";
		default:
			return "Future";
	}
}

function getTaskIconClass(status: string) {
	if (status === "completed") {
		return "text-emerald-600"; // primary color for completed (emerald matches the badge)
	}
	return "text-foreground/50";
}

function RouteComponent() {
	const { stars } = Route.useLoaderData();

	return (
		<div className="relative min-h-dvh w-full flex flex-col h-full z-10 px-4 md:px-0">
			<header className="border-b">
				<div className="max-w-2xl mx-auto px-4 py-4 md:py-5 flex items-center justify-between relative border-x">
					<Link to="/">
						<img
							src="/logo.png"
							alt="DB Studio"
							width={32}
						/>
					</Link>

					<div className="flex items-center gap-1">
						<Link to="/roadmap">
							<Button
								variant="ghost"
								className="gap-2 flex items-center justify-center text-xs cursor-pointer hover:bg-primary-foreground!"
							>
								Roadmap
							</Button>
						</Link>

						<a
							href="https://github.com/husamql3/db-studio"
							target="_blank"
							rel="noopener noreferrer"
						>
							<Button
								variant="ghost"
								className="gap-2 flex items-center justify-center text-xs cursor-pointer"
							>
								<IoLogoGithub className="size-4" />
								<span className="leading-none">{stars?.replace(".0k", "k")}</span>
							</Button>
						</a>
					</div>

					<PlusIcon
						className="-bottom-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -bottom-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
				</div>
			</header>

			<main className="flex-1 mx-auto border-x max-w-2xl w-full">
				<div className="h-full w-full flex-1 flex flex-col gap-4">
					{/* Page Title Section */}
					<div className="relative w-full flex flex-col border-b px-4 py-10 md:px-8 md:py-10 gap-4 dark:bg-[radial-gradient(35%_80%_at_25%_0%,--theme(--color-foreground/.1),transparent)]">
						<div className="w-full max-w-xl mx-auto text-center">
							<h1 className="text-2xl md:text-3xl font-bold mb-2">Product Roadmap</h1>
							<p className="text-sm text-muted-foreground">
								Follow our journey as we build the future of database management
							</p>
						</div>

						<PlusIcon
							className="-bottom-[12.5px] -left-[12.5px] absolute h-6 w-6"
							strokeWidth={1}
						/>
						<PlusIcon
							className="-right-[12.5px] -bottom-[12.5px] absolute h-6 w-6"
							strokeWidth={1}
						/>
					</div>

					{/* Timeline Section */}
					<div className="relative px-4 max-w-lg mx-auto py-6 md:py-12">
						<div className="relative">
							{/* Vertical Timeline Line */}
							<div className="absolute left-[11.5px] top-0 bottom-0 w-px bg-border" />

							{roadmapItems.map((item, index) => (
								<div
									key={index}
									className="relative pl-10 pb-10 last:pb-0"
								>
									{/* Plus Icon as Timeline Bullet */}
									<div className="absolute left-0 top-0 bg-background">
										<PlusIcon
											className="h-6 w-6"
											strokeWidth={1}
										/>
									</div>

									{/* Content Card */}
									<div>
										<div className="flex flex-col sm:flex-row sm:items-center gap-1 mb-4">
											<h3 className="text-lg font-semibold">{item.title}</h3>

											<span
												className={`inline-flex w-fit items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusStyles(item.status)}`}
											>
												{getStatusLabel(item.status)}
											</span>
										</div>

										<ul className="space-y-2">
											{item.items.map((task, taskIndex) => (
												<li
													key={taskIndex}
													className="flex items-start gap-2 text-sm text-muted-foreground"
												>
													{item.status === "completed" ? (
														<CheckIcon
															className={`h-4 w-4 mt-0.5 shrink-0 ${getTaskIconClass(item.status)}`}
														/>
													) : (
														<PlusIcon
															className={`h-4 w-4 mt-0.5 shrink-0 ${getTaskIconClass(item.status)}`}
															strokeWidth={1}
														/>
													)}
													<span>{task}</span>
												</li>
											))}
										</ul>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</main>

			<footer className="border-t">
				<div className="max-w-2xl mx-auto px-4 py-4 md:py-5 flex items-center justify-center relative border-x">
					<p className="text-xs font-light text-muted-foreground flex items-center gap-1">
						© 2025 db-studio. Built by{" "}
						<a
							href="https://github.com/husamql3"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:underline flex items-start gap-1"
						>
							<img
								src="/avocado.png"
								alt="avocado logo"
								width={16}
								height={16}
							/>
							Hüsam
						</a>
					</p>

					<PlusIcon
						className="-top-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -top-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
				</div>
			</footer>
		</div>
	);
}
