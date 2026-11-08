import type { RoadmapItemStatus } from "./content/roadmap";

export function getStatusStyles(status: RoadmapItemStatus) {
	switch (status) {
		case "completed":
			return "bg-emerald-400/10 text-emerald-400 border-emerald-400/25";
		case "in-progress":
			return "bg-brand/15 text-brand-light border-brand-light/25";
		case "planned":
			return "bg-amber-400/10 text-amber-400 border-amber-400/25";
		default:
			return "bg-muted text-muted-foreground border-border";
	}
}

export function getStatusLabel(status: RoadmapItemStatus) {
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

export function getTaskIconClass(status: RoadmapItemStatus) {
	switch (status) {
		case "completed":
			return "text-emerald-400";
		case "in-progress":
			return "text-brand-light";
		case "planned":
			return "text-muted-foreground/60";
	}
}
