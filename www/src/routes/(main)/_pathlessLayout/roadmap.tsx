import { createFileRoute } from "@tanstack/react-router";
import { CheckIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { Silk } from "@/components/silk";
import {
	type RoadmapItem,
	type RoadmapItemStatus,
	type RoadmapItemTask,
	roadmapItems,
} from "@/lib/content/roadmap";
import { getStatusLabel, getStatusStyles, getTaskIconClass } from "@/lib/roadmap-helpers";
import { cn } from "@/lib/utils";

const getTaskIcon = (status: RoadmapItemStatus) => {
	switch (status) {
		case "completed":
			return <CheckIcon className={cn("h-4 w-4 mt-0.5 shrink-0", getTaskIconClass(status))} />;
		case "in-progress":
			return (
				<Loader2Icon
					className={cn("h-4 w-4 mt-0.5 shrink-0 animate-spin", getTaskIconClass(status))}
				/>
			);
		case "planned":
			return <PlusIcon className={cn("h-4 w-4 mt-0.5 shrink-0", getTaskIconClass(status))} />;
	}
};

export const Route = createFileRoute("/(main)/_pathlessLayout/roadmap")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="flex-1 mx-auto border-x max-w-2xl w-full">
			<div className="h-full w-full flex-1 flex flex-col gap-4">
				{/* Page Title Section */}
				<div
					className={
						"relative w-full flex flex-col border-b px-4 py-10 md:px-8 md:py-10 gap-4"
						//  dark:bg-[radial-gradient(35%_80%_at_25%_0%,--theme(--color-foreground/.1),transparent)]
					}
				>
					<Silk
						speed={4}
						scale={1}
						color="#222222"
						noiseIntensity={0.4}
						rotation={0}
					/>

					<div className="w-full max-w-xl mx-auto text-center">
						<h1 className="text-2xl md:text-3xl font-bold mb-2">Product Roadmap</h1>
						<p className="text-sm">
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

						{roadmapItems.map((item: RoadmapItem, index: number) => (
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
								<div className="space-y-3 md:space-y-6">
									<div className="flex flex-col-reverse sm:flex-row sm:items-center gap-1">
										<h3 className="text-lg font-semibold">{item.title}</h3>

										<span
											className={cn(
												"inline-flex w-fit items-center px-2 py-0.5 rounded-full text-[10px] font-medium border",
												getStatusStyles(item.status),
											)}
										>
											{getStatusLabel(item.status)}
										</span>
									</div>

									<ul className="space-y-2">
										{item.items.map((task: RoadmapItemTask, taskIndex: number) => (
											<li
												key={`${item.title}-${task.title}-${taskIndex}`}
												className="flex items-start gap-2 text-sm text-muted-foreground"
											>
												{getTaskIcon(task.status)}
												<span>{task.title}</span>
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
	);
}
