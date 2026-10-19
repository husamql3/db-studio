import type { ServerLogEntrySchemaType } from "@db-studio/shared/types";
import { cn } from "@db-studio/ui/utils";
import { format } from "date-fns";
import {
	durationTone,
	formatDuration,
	LEVEL_LABEL,
	LEVEL_TEXT,
} from "@/features/logs/log-levels";
import { CellCopyButton } from "@/features/tables";

/**
 * One log entry as a line of text: time, level, duration, message. Clicking it opens
 * everything else the engine reported, the statement first.
 */
export const LogLine = ({
	entry,
	isOpen,
	onToggle,
	wrap,
}: {
	entry: ServerLogEntrySchemaType;
	isOpen: boolean;
	onToggle: () => void;
	wrap: boolean;
}) => {
	const details = {
		...(entry.statement && { statement: entry.statement }),
		time: format(new Date(entry.ts), "yyyy-MM-dd HH:mm:ss.SSS"),
		level: entry.rawLevel,
		...(entry.source && { source: entry.source }),
		...(entry.code && { code: entry.code }),
		...entry.detail,
	};

	return (
		<div className={cn(!wrap && "w-max min-w-full")}>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={isOpen}
				className={cn(
					"flex w-full gap-4 px-4 text-left hover:bg-accent/20",
					isOpen && "bg-accent/30",
				)}
			>
				<span className="w-[12ch] shrink-0 tabular-nums text-muted-foreground/60">
					{format(new Date(entry.ts), "HH:mm:ss.SSS")}
				</span>
				<span className={cn("w-[5ch] shrink-0", LEVEL_TEXT[entry.level])}>
					{LEVEL_LABEL[entry.level]}
				</span>
				<span
					className={cn(
						"w-[7ch] shrink-0 text-right tabular-nums",
						entry.durationMs !== undefined && durationTone(entry.durationMs),
					)}
				>
					{entry.durationMs !== undefined && formatDuration(entry.durationMs)}
				</span>
				<span
					className={cn(
						wrap ? "min-w-0 flex-1 whitespace-pre-wrap break-words" : "whitespace-pre",
					)}
				>
					{entry.message}
				</span>
			</button>

			{isOpen && (
				<dl className="grid grid-cols-[max-content_1fr] gap-x-3 pb-1 pl-[calc(24ch+4rem)] pr-4 text-xs leading-6 text-muted-foreground">
					{Object.entries(details).map(([key, value]) => (
						<div
							key={key}
							className="contents"
						>
							<dt>{key}</dt>
							<dd className="group relative whitespace-pre-wrap break-words pr-6 text-foreground/80">
								{value}
								<CellCopyButton value={value} />
							</dd>
						</div>
					))}
				</dl>
			)}
		</div>
	);
};
