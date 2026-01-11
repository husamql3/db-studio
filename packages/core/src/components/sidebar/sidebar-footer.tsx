import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Database, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
	useCurrentDatabase,
	useDatabaseConnectionInfo,
	useDatabasesList,
} from "@/hooks/use-databases-list";
import { cn } from "@/lib/utils";
import { useDatabaseStore } from "@/stores/database.store";

export function SidebarFooter() {
	const { databases, isLoadingDatabases, refetchDatabases, isRefetchingDatabases } =
		useDatabasesList();
	const { currentDatabase, isLoadingCurrentDatabase } = useCurrentDatabase();
	const { connectionInfo, isLoadingConnectionInfo } = useDatabaseConnectionInfo();
	const { selectedDatabase, setSelectedDatabase } = useDatabaseStore();
	const navigate = useNavigate();
	const [showDetails, setShowDetails] = useState(false);

	useEffect(() => {
		if (currentDatabase?.database && !selectedDatabase && !isLoadingCurrentDatabase) {
			setSelectedDatabase(currentDatabase.database);
		}
	}, [currentDatabase, selectedDatabase, setSelectedDatabase, isLoadingCurrentDatabase]);

	const handleDatabaseChange = (value: string) => {
		setSelectedDatabase(value);
		navigate({ to: "/table", search: {} });
	};

	const handleRefresh = async () => {
		await refetchDatabases();
		toast.success("Databases refreshed");
	};

	return (
		<div className="mt-auto border-t bg-background">
			<div className="p-4 space-y-2">
				{/* Database Selector - Primary Action */}
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Database className="h-4 w-4 text-muted-foreground" />
							<span className="text-sm font-medium">Database</span>
						</div>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6 hover:bg-accent"
									onClick={handleRefresh}
									disabled={isLoadingDatabases || isRefetchingDatabases}
								>
									<RefreshCw
										className={cn(
											"h-3.5 w-3.5",
											isLoadingDatabases || (isRefetchingDatabases && "animate-spin"),
										)}
									/>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Refresh databases</TooltipContent>
						</Tooltip>
					</div>

					<Select
						value={selectedDatabase || ""}
						onValueChange={handleDatabaseChange}
					>
						<SelectTrigger
							className="h-9 text-xs font-mono w-full"
							disabled={isLoadingDatabases || isRefetchingDatabases}
						>
							<SelectValue placeholder="Select database..." />
						</SelectTrigger>
						<SelectContent>
							{databases?.map((db) => (
								<SelectItem
									key={db.name}
									value={db.name}
									className="font-mono text-xs"
								>
									{db.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Connection Status - Collapsible */}
				<div className="space-y-2">
					<Button
						variant="ghost"
						className="w-full hover:bg-accent flex items-center justify-between"
						onClick={() => setShowDetails(!showDetails)}
						disabled={isLoadingConnectionInfo || isRefetchingDatabases}
					>
						<div className="flex items-center gap-2">
							<div className="flex items-center justify-center">
								<div className="relative flex h-2 w-2">
									<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
									<span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
								</div>
							</div>

							<span className="text-xs font-medium text-green-600">Connected</span>
						</div>
						<ChevronDown
							className={cn(
								"size-3 text-muted-foreground transition-transform",
								showDetails && "rotate-180",
							)}
						/>
					</Button>

					{/* Connection Details */}
					{showDetails && connectionInfo && (
						<div className="space-y-1.5 px-2 py-2 rounded-md bg-muted/30">
							<div className="flex justify-between items-center">
								<span className="text-xs text-muted-foreground">Host</span>
								<span className="text-xs font-mono text-foreground">
									{connectionInfo.host}:{connectionInfo.port}
								</span>
							</div>

							<div className="flex justify-between items-center">
								<span className="text-xs text-muted-foreground">User</span>
								<span className="text-xs font-mono text-foreground">
									{connectionInfo.user}
								</span>
							</div>

							<div className="flex justify-between items-center">
								<span className="text-xs text-muted-foreground">Databases</span>
								<span className="text-xs font-mono font-medium text-foreground">
									{databases?.length || 0}
								</span>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
