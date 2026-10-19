import { SERVER_LOG_LEVELS, type ServerLogLevel } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@db-studio/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { cn } from "@db-studio/ui/utils";
import { ListFilter, RefreshCw, Search, WrapText } from "lucide-react";
import { LEVEL_DOT } from "@/features/logs/log-levels";

const toolbarButton =
	"h-8! px-2.5 border-l-0 border-y-0 border-r border-border rounded-none text-xs font-medium gap-1.5 flex items-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors";

export const LogsToolbar = ({
	live,
	onLiveChange,
	hiddenLevels,
	onToggleLevel,
	levelCounts,
	search,
	onSearchChange,
	wrap,
	onWrapChange,
	source,
	refetch,
	isRefetching,
}: {
	live: boolean;
	onLiveChange: (live: boolean) => void;
	hiddenLevels: Set<ServerLogLevel>;
	onToggleLevel: (level: ServerLogLevel) => void;
	levelCounts: Map<ServerLogLevel, number>;
	search: string;
	onSearchChange: (search: string) => void;
	wrap: boolean;
	onWrapChange: (wrap: boolean) => void;
	source: string | undefined;
	refetch: () => void;
	isRefetching: boolean;
}) => (
	<header className="max-h-8 overflow-hidden border-b border-border w-full flex items-center justify-between bg-background text-foreground shrink-0">
		<div className="flex items-center">
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						onClick={refetch}
						disabled={isRefetching}
						aria-label="Reload the server log"
						className="size-8! aspect-square border-l-0 border-y-0 border-r border-border rounded-none text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
					>
						<RefreshCw className={cn("size-4", isRefetching && "animate-spin")} />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Reload</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onLiveChange(!live)}
						aria-pressed={live}
						className={cn(toolbarButton, live && "text-foreground")}
					>
						<span className="relative flex size-2 items-center justify-center">
							{live && (
								<span className="absolute inline-flex size-3.5 rounded-full bg-emerald-400 opacity-75 animate-ping" />
							)}
							<span
								className={cn(
									"relative inline-flex size-2 rounded-full",
									live ? "bg-emerald-500" : "bg-muted-foreground/40",
								)}
							/>
						</span>
						Live
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{live ? "Following new entries" : "Paused. Click to follow new entries."}
				</TooltipContent>
			</Tooltip>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						className={cn(toolbarButton, hiddenLevels.size > 0 && "text-foreground")}
					>
						<ListFilter className="size-4" />
						Severity
						{hiddenLevels.size > 0 && (
							<span className="text-muted-foreground">
								{SERVER_LOG_LEVELS.length - hiddenLevels.size}/{SERVER_LOG_LEVELS.length}
							</span>
						)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="w-48"
				>
					{SERVER_LOG_LEVELS.map((level) => (
						<DropdownMenuCheckboxItem
							key={level}
							checked={!hiddenLevels.has(level)}
							onSelect={(e) => e.preventDefault()}
							onCheckedChange={() => onToggleLevel(level)}
						>
							<span className={cn("size-2 rounded-full", LEVEL_DOT[level])} />
							<span className="flex-1 capitalize">{level}</span>
							<span className="tabular-nums text-muted-foreground">
								{levelCounts.get(level) ?? 0}
							</span>
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<label className="flex h-8 w-72 items-center gap-2 border-r border-border px-2.5 text-muted-foreground focus-within:text-foreground">
				<Search className="size-4 shrink-0" />
				<input
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					placeholder="Search messages, codes, statements"
					aria-label="Search the server log"
					className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
				/>
			</label>
		</div>

		<div className="flex min-w-0 items-center">
			{source && <span className="truncate px-3 text-xs text-muted-foreground">{source}</span>}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onWrapChange(!wrap)}
						aria-pressed={wrap}
						aria-label="Wrap long lines"
						className={cn(
							"size-8! aspect-square border-l border-y-0 border-r-0 border-border rounded-none text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors",
							wrap && "bg-muted text-foreground",
						)}
					>
						<WrapText className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Wrap long lines</TooltipContent>
			</Tooltip>
		</div>
	</header>
);
