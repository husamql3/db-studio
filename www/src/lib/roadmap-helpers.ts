import type { RoadmapItemStatus } from "./content/roadmap";

export const ROADMAP_STATUS: Record<
	RoadmapItemStatus,
	{ label: string; badgeClass: string; taskIconClass: string }
> = {
	completed: {
		label: "Completed",
		badgeClass: "bg-emerald-400/10 text-emerald-400 border-emerald-400/25",
		taskIconClass: "text-emerald-400",
	},
	"in-progress": {
		label: "In Progress",
		badgeClass: "bg-brand/15 text-brand-light border-brand-light/25",
		taskIconClass: "text-brand-light",
	},
	planned: {
		label: "Planned",
		badgeClass: "bg-amber-400/10 text-amber-400 border-amber-400/25",
		taskIconClass: "text-muted-foreground/60",
	},
};
