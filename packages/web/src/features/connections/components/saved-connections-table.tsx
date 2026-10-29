import { type ConnectionSummarySchemaType, DATABASE_ENGINES } from "@db-studio/shared/types";
import { Kbd } from "@db-studio/ui/kbd";
import { cn } from "@db-studio/ui/utils";
import { Lock, Search } from "lucide-react";
import { useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useConnect, useConnections } from "../hooks/use-connections";
import { formatLastUsed } from "../utils/format-last-used";
import { ConnectionActionsMenu } from "./connection-actions-menu";
import { ConnectionColorDot } from "./connection-color-dot";
import { ConnectionRenameInput } from "./connection-rename-input";

const GRID = "grid grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_6.5rem_4.5rem_1.75rem] gap-3";

const SavedConnectionRow = ({
	connection,
	isActive,
}: {
	connection: ConnectionSummarySchemaType;
	isActive: boolean;
}) => {
	const { connectSaved } = useConnect();
	const [renaming, setRenaming] = useState(false);
	const open = () => {
		if (!renaming) void connectSaved(connection);
	};

	return (
		<div
			role="button"
			tabIndex={0}
			aria-label={`Connect to ${connection.name}`}
			onClick={open}
			onKeyDown={(e) => {
				if (e.key === "Enter" && e.target === e.currentTarget) open();
			}}
			className={cn(
				GRID,
				"group relative cursor-pointer items-center border-b px-3 py-1.5 text-sm outline-none last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted/60",
				isActive && "bg-muted/40",
			)}
		>
			{isActive && <span className="absolute inset-y-0 left-0 w-1 bg-primary" />}
			<div className="flex min-w-0 items-center gap-2">
				<ConnectionColorDot color={connection.color} />
				{renaming ? (
					<ConnectionRenameInput
						connection={connection}
						onDone={() => setRenaming(false)}
					/>
				) : (
					<span className="truncate">{connection.name}</span>
				)}
				{connection.readOnly && (
					<Lock
						aria-label="Read-only"
						className="size-3 shrink-0 text-muted-foreground"
					/>
				)}
			</div>
			<span className="truncate font-mono text-xs text-muted-foreground">
				{connection.maskedUrl}
			</span>
			<span
				title={DATABASE_ENGINES[connection.dbType].label}
				className="truncate text-xs text-muted-foreground"
			>
				{DATABASE_ENGINES[connection.dbType].label}
			</span>
			<span className="text-right text-xs tabular-nums text-muted-foreground">
				{isActive ? "current" : formatLastUsed(connection.lastUsedAt)}
			</span>
			<div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
				<ConnectionActionsMenu
					connection={connection}
					onRename={() => setRenaming(true)}
				/>
			</div>
		</div>
	);
};

/** The saved connections as a grid, most recently used first. `/` focuses the filter. */
export const SavedConnectionsTable = () => {
	const { connections, active } = useConnections();
	const filterRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	useHotkeys("/", () => filterRef.current?.focus(), { preventDefault: true });

	const needle = query.trim().toLowerCase();
	const visible = needle
		? connections.filter((c) => `${c.name} ${c.maskedUrl}`.toLowerCase().includes(needle))
		: connections;

	if (connections.length === 0) {
		return (
			<p className="rounded-sm border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
				Connections you open are saved here.
			</p>
		);
	}

	return (
		<div className="overflow-hidden rounded-sm border">
			<div className="flex h-8 items-center border-b">
				<div className="relative h-full flex-1">
					<Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<input
						ref={filterRef}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Filter saved connections"
						aria-label="Filter saved connections"
						className="h-full w-full bg-transparent pl-8 pr-8 text-xs outline-none placeholder:text-muted-foreground"
					/>
					<Kbd className="absolute right-2 top-1/2 -translate-y-1/2">/</Kbd>
				</div>
				<span className="flex h-full items-center border-l px-3 text-xs text-muted-foreground">
					{connections.length} saved
				</span>
			</div>
			<div
				className={cn(
					GRID,
					"h-8 items-center border-b bg-muted/40 px-3 text-xs text-muted-foreground",
				)}
			>
				<span>Name</span>
				<span>URL</span>
				<span>Engine</span>
				<span className="text-right">Last used</span>
				<span />
			</div>
			{visible.map((connection) => (
				<SavedConnectionRow
					key={connection.id}
					connection={connection}
					isActive={connection.id === active?.id}
				/>
			))}
			{visible.length === 0 && (
				<p className="px-3 py-6 text-center text-xs text-muted-foreground">
					No saved connection matches "{query}".
				</p>
			)}
		</div>
	);
};
