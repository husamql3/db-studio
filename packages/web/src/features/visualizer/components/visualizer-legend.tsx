import { Diamond, KeyRound, Link2 } from "lucide-react";

export const VisualizerLegend = () => (
	<div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-md border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">
		<span className="flex items-center gap-1.5">
			<KeyRound className="size-3.5 text-amber-500" /> Primary key
		</span>
		<span className="flex items-center gap-1.5">
			<Link2 className="size-3.5 text-sky-500" /> Foreign key
		</span>
		<span className="flex items-center gap-1.5">
			<Diamond className="size-3 fill-current" /> Required
		</span>
		<span className="flex items-center gap-1.5">
			<Diamond className="size-3" /> Nullable
		</span>
	</div>
);
