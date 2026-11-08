import { DATABASE_ENGINES } from "@db-studio/shared/types";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@db-studio/ui/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { Check, Lock, Settings2 } from "lucide-react";
import { useDatabaseConnectionInfo } from "@/hooks/use-databases-list";
import { useConnect, useConnections } from "../hooks/use-connections";
import { formatLastUsed } from "../utils/format-last-used";
import { ConnectionColorDot } from "./connection-color-dot";

const RECENT_COUNT = 5;

/**
 * The open connection's name in the sidebar footer. It opens a menu with the connection's
 * details, the five most recent connections to switch to, and a link to the Connect page.
 */
export const ConnectionMenu = ({ databasesCount }: { databasesCount: number }) => {
	const { connections, active } = useConnections();
	const { connectSaved } = useConnect();
	const { connectionInfo } = useDatabaseConnectionInfo();
	const current = connections.find((c) => c.id === active?.id);
	const name =
		current?.name ?? (active ? DATABASE_ENGINES[active.dbType].label : "Not connected");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					title={active ? DATABASE_ENGINES[active.dbType].label : undefined}
					className="flex min-w-0 max-w-[55%] items-center gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-muted/60 aria-expanded:bg-muted/60"
				>
					<ConnectionColorDot color={current?.color ?? null} />
					<span className="truncate text-xs font-medium">{name}</span>
					{current?.readOnly && (
						<Lock
							aria-label="Read-only"
							className="size-3 shrink-0 text-muted-foreground"
						/>
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				side="top"
				sideOffset={6}
				className="w-72 p-0"
			>
				{connectionInfo && (
					<dl className="space-y-1 border-b px-3 py-2.5 text-xs">
						{(
							[
								[
									"Host",
									connectionInfo.host
										? `${connectionInfo.host}${connectionInfo.port ? `:${connectionInfo.port}` : ""}`
										: "Local file",
								],
								["User", connectionInfo.user || "—"],
								["Databases", databasesCount],
							] as const
						).map(([label, value]) => (
							<div
								key={label}
								className="flex justify-between gap-3"
							>
								<dt className="text-muted-foreground">{label}</dt>
								<dd className="truncate font-mono">{value}</dd>
							</div>
						))}
					</dl>
				)}
				<div className="p-1">
					<p className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						Switch connection
					</p>
					{connections.slice(0, RECENT_COUNT).map((connection) => {
						const isActive = connection.id === active?.id;
						return (
							<DropdownMenuItem
								key={connection.id}
								onSelect={() => {
									if (!isActive) void connectSaved(connection);
								}}
							>
								<ConnectionColorDot color={connection.color} />
								<span className="flex-1 truncate">{connection.name}</span>
								{isActive ? (
									<Check className="size-3.5 text-emerald-500" />
								) : (
									<span className="text-[10px] text-muted-foreground">
										{formatLastUsed(connection.lastUsedAt)}
									</span>
								)}
							</DropdownMenuItem>
						);
					})}
				</div>
				<DropdownMenuSeparator className="my-0" />
				<div className="p-1">
					<DropdownMenuItem asChild>
						<Link to="/connect">
							<Settings2 /> All connections…
						</Link>
					</DropdownMenuItem>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
