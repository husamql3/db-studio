import type { RoadmapItemStatus } from "./roadmap";

export function getStatusStyles(status: RoadmapItemStatus) {
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
			return "text-emerald-600";
		case "in-progress":
			return "text-[#1447e6]";
		case "planned":
			return "text-muted-foreground";
	}
}
