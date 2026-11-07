import type { RoutineInfoSchemaType } from "@db-studio/shared/types";
import { Badge } from "@db-studio/ui/badge";
import { Button } from "@db-studio/ui/button";
import { Input } from "@db-studio/ui/input";
import { ScrollArea } from "@db-studio/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { Spinner } from "@db-studio/ui/spinner";
import { cn } from "@db-studio/ui/utils";
import { Link, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useDatabaseStore } from "@/stores/database.store";
import { useRoutines } from "../hooks/use-routines";
import { RoutineTypeIcon } from "./routine-type-icon";

const routineKey = (routine: RoutineInfoSchemaType) =>
	[routine.schemaName, routine.routineName, routine.signature, routine.routineType]
		.map((part) => part ?? "")
		.join("\u0000");

export const SidebarContentRoutinesList = () => {
	const { selectedDatabase } = useDatabaseStore();
	return <RoutinesList key={selectedDatabase} />;
};

const RoutinesList = () => {
	const [search, setSearch] = useState("");
	const [schemaFilter, setSchemaFilter] = useState("all");
	const [typeFilter, setTypeFilter] = useState<"all" | "procedure" | "function">("all");
	const selected = useSearch({ from: "/_pathlessLayout/routines" });
	const { routines = [], isLoadingRoutines, errorRoutines } = useRoutines();
	const schemas = useMemo(
		() => [...new Set(routines.map((routine) => routine.schemaName))].sort(),
		[routines],
	);
	const visible = useMemo(() => {
		const needle = search.trim().toLowerCase();
		return routines.filter((routine) => {
			if (schemaFilter !== "all" && JSON.stringify(routine.schemaName) !== schemaFilter)
				return false;
			if (typeFilter !== "all" && routine.routineType !== typeFilter) return false;
			return [routine.schemaName, routine.routineName, routine.signature, routine.routineType]
				.filter(Boolean)
				.join(" ")
				.toLowerCase()
				.includes(needle);
		});
	}, [routines, search, schemaFilter, typeFilter]);

	return (
		<>
			<div className="shrink-0 space-y-2 px-3 pb-3 pt-2">
				<div
					className="flex gap-1"
					role="group"
					aria-label="Routine type"
				>
					{(
						[
							["all", "All"],
							["procedure", "Procedures"],
							["function", "Functions"],
						] as const
					).map(([value, label]) => (
						<Button
							key={value}
							type="button"
							variant={typeFilter === value ? "secondary" : "ghost"}
							size="sm"
							aria-pressed={typeFilter === value}
							onClick={() => setTypeFilter(value)}
							className="min-w-0 flex-1 px-1 text-xs"
						>
							{label}
						</Button>
					))}
				</div>
				<Select
					value={schemaFilter}
					onValueChange={setSchemaFilter}
				>
					<SelectTrigger
						variant="outline"
						aria-label="Routine schema"
						className="h-8 w-full"
					>
						<SelectValue placeholder="All schemas" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All schemas</SelectItem>
						{schemas.map((schema) => (
							<SelectItem
								key={JSON.stringify(schema)}
								value={JSON.stringify(schema)}
							>
								{schema ?? "Default schema"}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className="relative">
					<Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						variant="outline"
						placeholder="Search routines"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						className="h-8 rounded-sm pl-8"
					/>
				</div>
			</div>
			<ScrollArea className="flex-1 overflow-y-auto pb-3 block h-full w-full">
				{isLoadingRoutines ? (
					<div className="flex h-32 items-center justify-center">
						<Spinner size="size-6" />
					</div>
				) : errorRoutines ? (
					<div className="px-4 py-6 text-center text-sm text-destructive">
						Failed to load routines
					</div>
				) : visible.length === 0 ? (
					<div className="px-4 py-6 text-center text-sm text-muted-foreground">
						{search || schemaFilter !== "all" || typeFilter !== "all"
							? "No matching routines"
							: "No procedures or functions available"}
					</div>
				) : (
					<ul>
						{visible.map((routine) => {
							const isActive =
								selected.routine === routine.routineName &&
								selected.schema === (routine.schemaName ?? undefined) &&
								selected.signature === (routine.signature ?? undefined) &&
								selected.type === routine.routineType;

							return (
								<li
									key={routineKey(routine)}
									className="relative"
								>
									{isActive && (
										<span className="absolute inset-y-0 left-0 z-10 w-1 bg-primary" />
									)}
									<Link
										to="/routines"
										search={{
											routine: routine.routineName,
											schema: routine.schemaName ?? undefined,
											signature: routine.signature ?? undefined,
											type: routine.routineType,
										}}
										className={cn(
											"flex w-full items-start gap-2 px-4 py-2 text-left transition-colors",
											isActive
												? "bg-sidebar-accent text-sidebar-accent-foreground"
												: "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
										)}
									>
										<RoutineTypeIcon
											routineType={routine.routineType}
											className="mt-0.5"
										/>
										<div className="min-w-0 flex-1">
											<div className="truncate font-mono text-sm">
												{routine.schemaName && routine.schemaName !== "public"
													? `${routine.schemaName}.`
													: ""}
												{routine.routineName}
											</div>
											{routine.signature && (
												<div className="truncate font-mono text-xs text-muted-foreground">
													{routine.signature}
												</div>
											)}
										</div>
										<Badge
											variant="outline"
											className="shrink-0 px-1.5 text-[10px] capitalize"
										>
											{routine.routineType}
										</Badge>
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</ScrollArea>
		</>
	);
};
