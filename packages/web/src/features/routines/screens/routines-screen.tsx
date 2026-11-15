import { Button } from "@db-studio/ui/button";
import { Spinner } from "@db-studio/ui/spinner";
import { cn } from "@db-studio/ui/utils";
import { useSearch } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { RunnerScreen } from "@/features/query-runner";
import { useDatabaseStore } from "@/stores/database.store";
import { RoutineTypeIcon } from "../components/routine-type-icon";
import { useRoutines } from "../hooks/use-routines";

const ScreenMessage = ({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) => (
	<div
		className={cn(
			"flex flex-1 items-center justify-center text-sm text-muted-foreground",
			className,
		)}
	>
		{children}
	</div>
);

export const RoutinesScreen = () => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		routine: name,
		schema,
		signature,
		type,
	} = useSearch({
		from: "/_pathlessLayout/routines",
	});

	const { routines, isLoadingRoutines, errorRoutines } = useRoutines();

	const routine = routines?.find(
		(item) =>
			item.routineName === name &&
			(item.schemaName ?? undefined) === schema &&
			(item.signature ?? undefined) === signature &&
			item.routineType === type,
	);

	if (isLoadingRoutines) {
		return (
			<ScreenMessage>
				<Spinner size="size-6" />
			</ScreenMessage>
		);
	}

	if (errorRoutines) {
		return (
			<ScreenMessage className="text-destructive">
				Failed to load routines: {errorRoutines.message}
			</ScreenMessage>
		);
	}

	if (!name) return <ScreenMessage>Select a routine to open it</ScreenMessage>;

	if (!routine) return <ScreenMessage>This routine no longer exists</ScreenMessage>;

	// Without source (encrypted or wrapped routines) the runner still opens, to call the routine.
	const { definition } = routine;

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<header className="flex h-8 shrink-0 items-center border-b border-border bg-background text-sm">
				<div className="flex min-w-0 flex-1 items-center gap-2 px-3">
					<RoutineTypeIcon
						routineType={routine.routineType}
						className="size-3.5 text-muted-foreground"
					/>
					<h1 className="truncate font-medium">
						{routine.schemaName && (
							<span className="text-muted-foreground/60">{routine.schemaName}.</span>
						)}
						{routine.routineName}
					</h1>
					<span className="truncate text-xs text-muted-foreground">
						({routine.signature ?? "…"}){routine.returnType && ` → ${routine.returnType}`}
					</span>
				</div>
				{routine.language && (
					<span className="shrink-0 px-2 text-xs text-muted-foreground">
						{routine.language}
					</span>
				)}
				{definition && (
					<Button
						size="segment"
						type="button"
						variant="ghost"
						className="border-r-0 border-l border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
						aria-label="Copy the routine definition"
						onClick={() => {
							void navigator.clipboard.writeText(definition);
							toast.success("Routine code copied");
						}}
					>
						Copy definition <Copy />
					</Button>
				)}
			</header>
			<RunnerScreen
				key={`${selectedDatabase}\u0000${routine.schemaName ?? ""}\u0000${routine.routineName}\u0000${routine.signature ?? ""}\u0000${routine.routineType}`}
				initialQuery={
					definition ??
					`-- The database does not expose the source of ${routine.routineName}.\n-- Call it here.\n`
				}
				minimalToolbar
			/>
		</div>
	);
};
