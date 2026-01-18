import {
	IconCodeDots,
	IconHeart,
	IconHeartFilled,
	IconTable,
} from "@tabler/icons-react";
import { AlignLeft, Command, LucideCornerDownLeft } from "lucide-react";
import { useQueryState } from "nuqs";
import { FiSave } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { CONSTANTS } from "@/utils/constants";
import type { QueryResult } from "./runner-tab";

export const RunnerHeader = ({
	isExecutingQuery,
	handleButtonClick,
	handleFormatQuery,
	handleSaveQuery,
	handleFavorite,
	isFavorite,
	queryId,
	hasUnsavedChanges,
	queryResult,
}: {
	isExecutingQuery: boolean;
	handleButtonClick: () => void;
	handleFormatQuery: () => void;
	handleSaveQuery: () => void;
	handleFavorite: () => void;
	isFavorite: boolean;
	queryId: string;
	hasUnsavedChanges: boolean;
	queryResult: QueryResult | null;
}) => {
	const [showAs, setShowAs] = useQueryState(
		CONSTANTS.RUNNER_STATE_KEYS.SHOW_AS,
	);

	return (
		<header className="max-h-8 overflow-hidden border-b border-zinc-800 w-full flex items-center justify-between bg-black sticky top-0 left-0 right-0 z-0">
			<div className="flex items-center">
				<Button
					type="button"
					variant="default"
					className="h-8! border-l-0 border-y-0 border-r border-black rounded-none bg-green-700/60 text-white hover:bg-green-800/60 gap-1 disabled:opacity-50"
					onClick={handleButtonClick}
					disabled={isExecutingQuery}
					aria-label="Run the query"
				>
					Run
					<Command className="size-3" />
					<LucideCornerDownLeft className="size-3" />
				</Button>

				<Button
					type="button"
					variant="ghost"
					className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
					aria-label="Format the query"
					onClick={handleFormatQuery}
				>
					Format <AlignLeft className="size-3" />
				</Button>

				<Button
					type="button"
					variant="ghost"
					className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
					aria-label="Save the query"
					onClick={handleSaveQuery}
				>
					Save <FiSave className="size-3" />
				</Button>

				<Button
					type="button"
					variant="ghost"
					className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
					aria-label="Favorite the query"
					onClick={handleFavorite}
				>
					{isFavorite ? (
						<IconHeartFilled className="size-3" />
					) : (
						<IconHeart className="size-3" />
					)}
				</Button>

				{queryId && hasUnsavedChanges && (
					<span className="text-xs px-2 text-muted-foreground">
						Unsaved changes
					</span>
				)}
			</div>

			<div className="flex items-center">
				{queryResult && (
					<div className="flex items-center gap-1 px-2">
						<span className="text-xs text-gray-500">
							{queryResult.data?.duration?.toFixed(2)}ms
						</span>
						<span className="text-xs text-gray-500">•</span>
						<span className="text-xs text-gray-500">
							{queryResult.data?.rowCount ?? 0} rows
						</span>
					</div>
				)}

				<ToggleGroup
					type="single"
					variant="ghost"
					onValueChange={(value) => {
						if (value === showAs) return;
						setShowAs(value);
					}}
					value={showAs ?? undefined}
					className="h-8! rounded-none! border-l!"
				>
					<Tooltip>
						<TooltipTrigger asChild>
							<ToggleGroupItem
								value="table"
								aria-label="Toggle table"
								className="rounded-none! h-8! aspect-square!"
								data-selected={showAs === "table"}
							>
								<IconTable />
							</ToggleGroupItem>
						</TooltipTrigger>
						<TooltipContent>
							<p>View as a table</p>
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<ToggleGroupItem
								value="json"
								aria-label="Toggle JSON"
								className="rounded-none! h-8! aspect-square!"
								data-selected={showAs === "json"}
							>
								<IconCodeDots />
							</ToggleGroupItem>
						</TooltipTrigger>
						<TooltipContent>
							<p>View as a JSON</p>
						</TooltipContent>
					</Tooltip>
				</ToggleGroup>
			</div>
		</header>
	);
};
