import { createFileRoute } from "@tanstack/react-router";
import { CheckIcon, CircleDashedIcon, CircleDotIcon } from "lucide-react";
import { SectionHeader } from "@/components/section";
import { Silk } from "@/components/silk";
import {
	type RoadmapItem,
	type RoadmapItemStatus,
	type RoadmapItemTask,
	roadmapItems,
} from "@/lib/content/roadmap";
import { getStatusLabel, getStatusStyles, getTaskIconClass } from "@/lib/roadmap-helpers";
import { seoHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

// Static icons: a spinner says "loading", not "being built".
const TASK_ICONS = {
	completed: CheckIcon,
	"in-progress": CircleDotIcon,
	planned: CircleDashedIcon,
} satisfies Record<RoadmapItemStatus, unknown>;

const shipped = (tasks: RoadmapItemTask[]) =>
	tasks.filter((task) => task.status === "completed").length;

const allTasks = roadmapItems.flatMap((item) => item.items);

export const Route = createFileRoute("/(main)/_pathlessLayout/roadmap")({
	component: RouteComponent,
	head: () =>
		seoHead({
			title: "Roadmap – dbstudio",
			description:
				"What's shipped, in progress, and planned for dbstudio: database support, table editing, query tools, and more.",
			path: "/roadmap",
		}),
});

function Progress({ tasks }: { tasks: RoadmapItemTask[] }) {
	return (
		<p className="flex items-baseline gap-2 text-xs tabular-nums text-muted-foreground">
			<span className="text-2xl font-medium tracking-tight text-foreground">
				{shipped(tasks)}
			</span>
			/ {tasks.length} shipped
		</p>
	);
}

function RouteComponent() {
	return (
		<main className="mx-auto w-full max-w-5xl flex-1 border-x">
			<div className="relative isolate overflow-hidden">
				<Silk
					speed={4}
					scale={1}
					color="#222222"
					noiseIntensity={0.4}
					rotation={0}
				/>
				<SectionHeader
					level={1}
					eyebrow="Roadmap"
					title="Where db-studio is going"
					description="What's shipped, what's being built, and what's next."
				/>
				<div className="px-5 pb-10 md:px-8">
					<Progress tasks={allTasks} />
				</div>
			</div>

			<ol className="border-t">
				{roadmapItems.map((item: RoadmapItem) => (
					<li
						key={item.title}
						className="grid gap-5 border-b px-5 py-8 last:border-b-0 md:grid-cols-[220px_1fr] md:gap-8 md:px-8"
					>
						<div className="flex flex-col gap-3 md:sticky md:top-24 md:self-start">
							<div className="flex flex-wrap items-center gap-2">
								<h2 className="text-base font-medium tracking-tight">{item.title}</h2>
								<span
									className={cn(
										"rounded-[3px] border px-1.5 py-0.5 text-[10px]",
										getStatusStyles(item.status),
									)}
								>
									{getStatusLabel(item.status)}
								</span>
							</div>
							<Progress tasks={item.items} />
						</div>

						<ul className="flex max-w-2xl flex-col gap-2.5">
							{item.items.map((task: RoadmapItemTask) => {
								const Icon = TASK_ICONS[task.status];
								return (
									<li
										key={task.title}
										className={cn(
											"flex items-start gap-2.5 text-[13px] leading-relaxed text-pretty",
											task.status === "planned"
												? "text-muted-foreground"
												: "text-foreground/85",
										)}
									>
										<Icon
											aria-label={getStatusLabel(task.status)}
											className={cn(
												"mt-[3px] size-3.5 shrink-0",
												getTaskIconClass(task.status),
											)}
										/>
										{task.title}
									</li>
								);
							})}
						</ul>
					</li>
				))}
			</ol>
		</main>
	);
}
