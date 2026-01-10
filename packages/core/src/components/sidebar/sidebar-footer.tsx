import { useNavigate } from "@tanstack/react-router";
import { Database, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
	useCurrentDatabase,
	useDatabaseConnectionInfo,
	useDatabasesList,
} from "@/hooks/use-databases-list";
import { useDatabaseStore } from "@/stores/database.store";

export function SidebarFooter() {
	const { data: databases, isLoading: isLoadingDatabases, refetch } = useDatabasesList();
	const { data: currentDb } = useCurrentDatabase();
	const { data: connectionInfo } = useDatabaseConnectionInfo();
	const { selectedDatabase, setSelectedDatabase } = useDatabaseStore();
	const navigate = useNavigate();

	// Initialize selectedDatabase with currentDatabase on mount
	useEffect(() => {
		if (currentDb?.database && !selectedDatabase) {
			setSelectedDatabase(currentDb.database);
		}
	}, [currentDb, selectedDatabase, setSelectedDatabase]);

	const handleDatabaseChange = (value: string) => {
		setSelectedDatabase(value);
		// Clear active table when switching databases
		navigate({ to: "/table", search: {} });
	};

	const handleRefresh = () => {
		refetch();
	};

	return (
		<div className="mt-auto border-t bg-background">
			<div className="p-3 space-y-3">
				{/* Connection Status */}
				<div className="flex items-center gap-2 px-1">
					<div className="relative flex h-2 w-2">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
						<span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
					</div>
					<span className="text-xs font-medium text-green-600 dark:text-green-400">
						Connected
					</span>
				</div>

				{/* Database Selector */}
				<div className="space-y-1.5">
					<div className="flex items-center justify-between px-1">
						<div className="flex items-center gap-1.5">
							<Database className="h-3.5 w-3.5 text-muted-foreground" />
							<span className="text-xs font-medium text-foreground">Database</span>
						</div>
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6 hover:bg-accent"
							onClick={handleRefresh}
							disabled={isLoadingDatabases}
							title="Refresh databases"
						>
							<RefreshCw
								className={`h-3 w-3 ${isLoadingDatabases ? "animate-spin" : ""}`}
							/>
						</Button>
					</div>
					<Select
						value={selectedDatabase || ""}
						onValueChange={handleDatabaseChange}
					>
						<SelectTrigger className="h-9 text-sm font-mono">
							<SelectValue placeholder="Select database..." />
						</SelectTrigger>
						<SelectContent>
							{databases?.map((db) => (
								<SelectItem
									key={db.name}
									value={db.name}
									className="font-mono"
								>
									{db.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Connection Info */}
				{connectionInfo && (
					<>
						<Separator className="my-2" />
						<div className="space-y-1.5 px-1">
							<div className="flex justify-between items-center text-xs">
								<span className="text-muted-foreground">Host</span>
								<span className="font-mono text-foreground">
									{connectionInfo.host}:{connectionInfo.port}
								</span>
							</div>
							<div className="flex justify-between items-center text-xs">
								<span className="text-muted-foreground">User</span>
								<span className="font-mono text-foreground">{connectionInfo.user}</span>
							</div>
							<div className="flex justify-between items-center text-xs">
								<span className="text-muted-foreground">Total DBs</span>
								<span className="font-mono font-medium text-foreground">
									{databases?.length || 0}
								</span>
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
