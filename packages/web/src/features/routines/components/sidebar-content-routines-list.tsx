import type { RoutineInfoSchemaType } from "@db-studio/shared/types";
import { Input } from "@db-studio/ui/input";
import { Kbd } from "@db-studio/ui/kbd";
import { ScrollArea } from "@db-studio/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { Spinner } from "@db-studio/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@db-studio/ui/toggle-group";
import { cn } from "@db-studio/ui/utils";
import { Link, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";
import { useRoutines } from "../hooks/use-routines";

type TypeFilter = "all" | RoutineInfoSchemaType["routineType"];

const TYPE_FILTERS: [TypeFilter, string][] = [
	["all", "All"],
	["function", "Functions"],
	["procedure", "Procedures"],
];

const routineKey = (routine: RoutineInfoSchemaType) =>
	[routine.schemaName, routine.routineName, routine.signature, routine.routineType]
		.map((part) => part ?? "")
		.join("\u0000");

export const SidebarContentRoutinesList = () => {
	const { selectedDatabase } = useDatabaseStore();

	return <RoutinesList key={selectedDatabase} />;
};

const RoutinesList = () => {
	const inputRef = useRef<HTMLInputElement>(null);
	const [search, setSearch] = useState("");
	const [schemaFilter, setSchemaFilter] = useState<string>(CONSTANTS.ALL_SCHEMAS);
	const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
	const selected = useSearch({ from: "/_pathlessLayout/routines" });
	const { routines = [], isLoadingRoutines, errorRoutines } = useRoutines();

	useHotkeys("/", () => inputRef.current?.focus(), { preventDefault: true });

	const schemas = useMemo(
		() =>
			[
				...new Set(
					routines.flatMap((routine) => (routine.schemaName ? [routine.schemaName] : [])),
				),
			].sort(),
		[routines],
	);

	const visible = useMemo(() => {
		const needle = search.trim().toLowerCase();

		return routines.filter(
			(routine) =>
				(schemaFilter === CONSTANTS.ALL_SCHEMAS || routine.schemaName === schemaFilter) &&
				(typeFilter === "all" || routine.routineType === typeFilter) &&
				`${routine.schemaName ?? ""}.${routine.routineName}`.toLowerCase().includes(needle),
		);
	}, [routines, search, schemaFilter, typeFilter]);

	const isFiltered =
		search !== "" || schemaFilter !== CONSTANTS.ALL_SCHEMAS || typeFilter !== "all";

	return (
		<>
			{schemas.length > 1 && (
				<div className="px-3 pt-3">
					<Select
						value={schemaFilter}
						onValueChange={setSchemaFilter}
					>
						<SelectTrigger
							variant="outline"
							aria-label="Schema"
							className="h-8! w-full justify-between rounded-sm"
						>
							<SelectValue placeholder="Select schema" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={CONSTANTS.ALL_SCHEMAS}>All schemas</SelectItem>
							{schemas.map((schema) => (
								<SelectItem
									key={schema}
									value={schema}
								>
									{schema}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			<div className="space-y-2 px-3 pb-3 pt-2">
				<div className="relative">
					<Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						ref={inputRef}
						variant="outline"
						placeholder="Search routines"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						className="h-8 rounded-sm pl-8 pr-8"
					/>
					<Kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-xs">/</Kbd>
				</div>
				<ToggleGroup
					type="single"
					variant="outline"
					className="w-full"
					value={typeFilter}
					onValueChange={(value: TypeFilter | "") => {
						if (value) setTypeFilter(value);
					}}
					aria-label="Routine type"
				>
					{TYPE_FILTERS.map(([value, label]) => (
						<ToggleGroupItem
							key={value}
							value={value}
							className="flex-1"
						>
							{label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			{/* Radix wraps the list in a `display: table` div that widens to the longest name. */}
			<ScrollArea className="flex-1 overflow-y-auto pb-3 block h-full w-full [&_[data-slot=scroll-area-viewport]>div]:block!">
				{isLoadingRoutines ? (
					<div className="flex h-32 items-center justify-center">
						<Spinner size="size-6" />
					</div>
				) : errorRoutines ? (
					<p className="px-4 py-6 text-center text-sm text-destructive">
						Failed to load routines
					</p>
				) : visible.length === 0 ? (
					<p className="px-4 py-6 text-center text-sm text-muted-foreground">
						{isFiltered ? "No routines found matching" : "No routines available"}
					</p>
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
										title={`${routine.routineName}(${routine.signature ?? ""})`}
										className={cn(
											"flex w-full items-center gap-2 py-1.5 pl-4 pr-2 text-sm transition-colors focus:outline-none",
											isActive
												? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
												: "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus:bg-sidebar-accent focus:text-sidebar-accent-foreground",
										)}
									>
										<span className="min-w-0 flex-1 truncate">
											{routine.schemaName &&
												routine.schemaName !== CONSTANTS.DEFAULT_SCHEMA && (
													<span className="text-muted-foreground/60">
														{routine.schemaName}.
													</span>
												)}
											{routine.routineName}
											<span className="text-muted-foreground/60">
												({routine.signature ?? "…"})
											</span>
										</span>
										<Kbd>{routine.routineType === "procedure" ? "proc" : "fn"}</Kbd>
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
