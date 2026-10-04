import type { DesktopServerStatus, SavedConnectionSchemaType } from "@db-studio/shared/types";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@db-studio/ui/alert-dialog";
import { Badge } from "@db-studio/ui/badge";
import { Button } from "@db-studio/ui/button";
import { Spinner } from "@db-studio/ui/spinner";
import { cn } from "@db-studio/ui/utils";
import { Pencil, Plug, Trash2, Unplug } from "lucide-react";

export const ConnectionListItem = ({
	connection,
	status,
	onConnect,
	onDisconnect,
	onEdit,
	onDelete,
}: {
	connection: SavedConnectionSchemaType;
	status: DesktopServerStatus;
	onConnect: () => unknown;
	onDisconnect: () => unknown;
	onEdit: () => void;
	onDelete: () => unknown;
}) => {
	const isThis = status.state !== "idle" && status.connectionId === connection.id;
	const isRunning = isThis && status.state === "running";
	const isStarting = isThis && status.state === "starting";
	const isBusy = status.state === "starting";

	return (
		<li
			className={cn(
				"flex items-center gap-3 rounded-lg border p-3",
				isRunning && "border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-950/10",
			)}
		>
			<span
				aria-hidden
				className="size-2.5 shrink-0 rounded-full"
				style={{ backgroundColor: connection.color ?? "#1447e6" }}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-sm font-medium">{connection.name}</span>
					{connection.dbType && (
						<Badge
							variant="secondary"
							className="font-mono text-[10px] uppercase"
						>
							{connection.dbType}
						</Badge>
					)}
					{isRunning && (
						<Badge className="bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
							Connected
						</Badge>
					)}
				</div>
				<p className="truncate font-mono text-xs text-muted-foreground">
					{connection.summary}
				</p>
				{isThis && status.state === "error" && (
					<p className="mt-1 text-xs text-destructive">{status.message}</p>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Edit ${connection.name}`}
					disabled={isBusy}
					onClick={onEdit}
				>
					<Pencil className="size-4" />
				</Button>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label={`Delete ${connection.name}`}
							disabled={isBusy || isRunning}
						>
							<Trash2 className="size-4" />
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete {connection.name}?</AlertDialogTitle>
							<AlertDialogDescription>
								The saved connection URL is removed from this device. The database itself is
								not touched.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
				{isRunning ? (
					<Button
						variant="outline"
						size="sm"
						onClick={onDisconnect}
					>
						<Unplug className="size-3.5" />
						Disconnect
					</Button>
				) : (
					<Button
						size="sm"
						disabled={isBusy}
						onClick={onConnect}
					>
						{isStarting ? (
							<Spinner
								size="size-3.5"
								color="bg-primary-foreground"
							/>
						) : (
							<Plug className="size-3.5" />
						)}
						Connect
					</Button>
				)}
			</div>
		</li>
	);
};
