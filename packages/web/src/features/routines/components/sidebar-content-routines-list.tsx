import type { RoutineInfoSchemaType } from "@db-studio/shared/types";
import { Badge } from "@db-studio/ui/badge";
import { Input } from "@db-studio/ui/input";
import { ScrollArea } from "@db-studio/ui/scroll-area";
import { Spinner } from "@db-studio/ui/spinner";
import { cn } from "@db-studio/ui/utils";
import { Link, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useRoutines } from "../hooks/use-routines";

const routineKey = (routine: RoutineInfoSchemaType) =>
	[routine.schemaName, routine.routineName, routine.signature, routine.routineType]
		.map((part) => part ?? "")
		.join("\u0000");

export const SidebarContentRoutinesList = () => {
	const [search, setSearch] = useState("");
	const selected = useSearch({ from: "/_pathlessLayout/routines" });
	const { routines = [], isLoadingRoutines, errorRoutines } = useRoutines();

	const visible = useMemo(() => {
		const needle = search.trim().toLowerCase();

		if (!needle) return routines;

		return routines.filter((routine) =>
			[routine.schemaName, routine.routineName, routine.signature, routine.routineType]
				.filter(Boolean)
				.join(" ")
				.toLowerCase()
				.includes(needle),
		);
	}, [routines, search]);

	return (
		<>
			<div className="px-3 pb-3 pt-2">
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
						{search ? "No matching routines" : "No procedures or functions available"}
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
