import type { ServerLogEntrySchemaType, ServerLogLevel } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import { Spinner } from "@db-studio/ui/spinner";
import { ArrowDownToLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LogLine } from "../components/log-line";
import { LogsToolbar } from "../components/logs-toolbar";
import { useServerLogs } from "../hooks/use-server-logs";

/**
 * Entries carry no id, and live polling shifts their positions, so a line is its content: every
 * field, so engine ids in `detail` (a Redis slowlog id) tell apart a command repeated within one
 * timestamp. Entries identical in every field are told apart by their order.
 */
const keyEntries = (entries: ServerLogEntrySchemaType[]) => {
	const seen = new Map<string, number>();
	return entries.map((entry) => {
		const content = JSON.stringify(entry);
		const n = seen.get(content) ?? 0;
		seen.set(content, n + 1);
		return { entry, key: `${content}#${n}` };
	});
};

const matchesSearch = (entry: ServerLogEntrySchemaType, search: string) =>
	!search ||
	[entry.message, entry.statement, entry.source, entry.code, ...Object.values(entry.detail)]
		.join(" ")
		.toLowerCase()
		.includes(search.toLowerCase());

const Notice = ({ title, body }: { title: string; body: string }) => (
	<div className="size-full flex flex-col items-center justify-center gap-2 px-6 text-center">
		<div className="text-sm font-medium">{title}</div>
		<div className="max-w-lg text-sm text-muted-foreground">{body}</div>
	</div>
);

export const LogsScreen = () => {
	const [live, setLive] = useState(true);
	const [hiddenLevels, setHiddenLevels] = useState<Set<ServerLogLevel>>(new Set(["debug"]));
	const [search, setSearch] = useState("");
	const [wrap, setWrap] = useState(false);
	const [expanded, setExpanded] = useState<string | null>(null);
	const scroller = useRef<HTMLDivElement>(null);
	const {
		serverLogs,
		isLoadingServerLogs,
		isRefetchingServerLogs,
		errorServerLogs,
		refetchServerLogs,
	} = useServerLogs({ live });

	const entries = serverLogs?.available ? serverLogs.entries : [];
	const visible = keyEntries(entries).filter(
		({ entry }) => !hiddenLevels.has(entry.level) && matchesSearch(entry, search),
	);
	const levelCounts = new Map<ServerLogLevel, number>();
	for (const entry of entries) {
		levelCounts.set(entry.level, (levelCounts.get(entry.level) ?? 0) + 1);
	}

	// While live, stay on the newest line as entries arrive.
	const newestKey = visible.at(-1)?.key;
	useEffect(() => {
		if (live && newestKey) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
	}, [live, newestKey]);

	const toggleLevel = (level: ServerLogLevel) =>
		setHiddenLevels((prev) => {
			const next = new Set(prev);
			if (next.has(level)) next.delete(level);
			else next.add(level);
			return next;
		});

	const renderBody = () => {
		if (isLoadingServerLogs) {
			return (
				<div className="size-full flex items-center justify-center">
					<Spinner size="size-7" />
				</div>
			);
		}
		if (errorServerLogs) {
			return (
				<Notice
					title="Failed to load the server log"
					body={errorServerLogs.message}
				/>
			);
		}
		if (serverLogs && !serverLogs.available) {
			return (
				<Notice
					title="The server log is out of reach"
					body={serverLogs.reason}
				/>
			);
		}
		if (entries.length === 0) {
			return (
				<Notice
					title="The server log is empty"
					body="New entries appear here as the server writes them."
				/>
			);
		}
		if (visible.length === 0) {
			return (
				<Notice
					title="No entries match"
					body="Clear the search or show more severity levels."
				/>
			);
		}
		return (
			<div
				ref={scroller}
				// Scrolling back through history pauses the live tail, so new lines don't pull
				// the view away.
				onWheel={(e) => e.deltaY < 0 && live && setLive(false)}
				className="size-full overflow-auto py-3 text-sm leading-7"
			>
				{visible.map(({ entry, key }) => (
					<LogLine
						key={key}
						entry={entry}
						wrap={wrap}
						isOpen={expanded === key}
						onToggle={() => setExpanded(expanded === key ? null : key)}
					/>
				))}
			</div>
		);
	};

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<LogsToolbar
				live={live}
				onLiveChange={setLive}
				hiddenLevels={hiddenLevels}
				onToggleLevel={toggleLevel}
				levelCounts={levelCounts}
				search={search}
				onSearchChange={setSearch}
				wrap={wrap}
				onWrapChange={setWrap}
				source={serverLogs?.available ? serverLogs.source : undefined}
				refetch={refetchServerLogs}
				isRefetching={isRefetchingServerLogs}
			/>

			<div className="min-h-0 flex-1">{renderBody()}</div>

			<footer className="h-9 shrink-0 border-t border-border flex items-center justify-between bg-background px-2 text-xs text-muted-foreground">
				<p aria-live="polite">
					Showing <span className="text-foreground font-medium">{visible.length}</span> of{" "}
					<span className="text-foreground font-medium">{entries.length}</span> newest entries
				</p>
				{!live && (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="h-6 gap-1.5 text-xs"
						onClick={() => setLive(true)}
					>
						<ArrowDownToLine className="size-3.5" />
						Jump to latest
					</Button>
				)}
			</footer>
		</div>
	);
};
