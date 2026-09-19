import { Button } from "@db-studio/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { cn } from "@db-studio/ui/utils";
import { useCallback } from "react";
import { useLiveModeStore } from "../../stores/live-mode.store";

interface LiveModeToggleProps {
	tableName: string;
}

export const LiveModeToggle = ({ tableName }: LiveModeToggleProps) => {
	const isLive = useLiveModeStore((state) => state.isLive);
	const status = useLiveModeStore((state) => state.status);
	const isPulsing = useLiveModeStore((state) => state.isPulsing);
	const setLive = useLiveModeStore((state) => state.setLive);

	const handleToggle = useCallback(() => {
		setLive(!isLive, tableName);
	}, [isLive, tableName, setLive]);

	let tooltipText = "Live mode: Automatic 1s PostgreSQL updates (Off)";
	if (status === "paused") {
		tooltipText = "Live mode paused while editing. Click to resume.";
	} else if (isLive && status === "healthy") {
		tooltipText = "Live mode: Active (healthy, 1s polling)";
	} else if (isLive && status === "disconnected") {
		tooltipText = "Live mode: Disconnected. Attempting to reconnect...";
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					onClick={handleToggle}
					aria-label="Toggle Live mode"
					aria-pressed={isLive}
					className={cn(
						"h-8! px-2.5 border-l-0 border-y-0 border-r border-border rounded-none text-xs font-medium gap-1.5 flex items-center transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/60",
						isLive && "text-foreground bg-accent/20",
					)}
				>
					<span className="relative flex size-2 items-center justify-center">
						{isLive && status === "healthy" && isPulsing && (
							<span
								data-testid="live-pulse-indicator"
								className="absolute inline-flex size-3.5 rounded-full bg-emerald-400 opacity-75 animate-ping"
							/>
						)}
						<span
							data-testid="live-status-dot"
							className={cn("relative inline-flex size-2 rounded-full transition-colors", {
								"bg-emerald-500": isLive && status === "healthy",
								"bg-amber-500": isLive && status === "disconnected",
								"bg-amber-400": !isLive && status === "paused",
								"bg-muted-foreground/40": !isLive && status !== "paused",
							})}
						/>
					</span>
					<span>Live</span>
					{status === "paused" && (
						<span className="text-[10px] text-amber-500 font-normal">(Paused)</span>
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{tooltipText}</TooltipContent>
		</Tooltip>
	);
};
