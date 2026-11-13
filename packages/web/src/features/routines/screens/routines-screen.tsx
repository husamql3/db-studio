import type { ExecuteQueryResult, RoutineInfoSchemaType } from "@db-studio/shared/types";
import { Badge } from "@db-studio/ui/badge";
import { Button } from "@db-studio/ui/button";
import { cn } from "@db-studio/ui/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Copy, Play, RotateCcw } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { QueryResultContainer, useExecuteQuery } from "@/features/query-runner";
import { routineKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { RoutineCodeEditor } from "../components/routine-code-editor";
import { RoutineTypeIcon } from "../components/routine-type-icon";
import { useRoutines } from "../hooks/use-routines";

const RoutineDetail = ({ routine }: { routine: RoutineInfoSchemaType }) => {
	const definition = routine.definition;
	const [code, setCode] = useState(definition ?? "");
	const [selectedCode, setSelectedCode] = useState("");
	const [result, setResult] = useState<ExecuteQueryResult | null>(null);
	const [lastExecutedQuery, setLastExecutedQuery] = useState("");
	const [resultsVisible, setResultsVisible] = useState(false);
	const resultsId = useId();
	const { selectedDatabase } = useDatabaseStore();
	const queryClient = useQueryClient();
	const { executeQueryAsync, isExecutingQuery, executeQueryError } = useExecuteQuery();
	const executingRef = useRef(false);

	const handleExecute = async (query: string) => {
		if (executingRef.current || !selectedDatabase) return;
		if (!query.trim()) {
			toast.error("Query is empty!");
			return;
		}
		executingRef.current = true;
		setResultsVisible(true);
		setLastExecutedQuery(query);
		setResult(null);
		try {
			const data = await executeQueryAsync({ query });
			if (data) {
				setResult(data);
				void queryClient.invalidateQueries({
					queryKey: routineKeys.database(selectedDatabase),
				});
			}
		} catch {
			// The mutation exposes the failure through executeQueryError below.
		} finally {
			executingRef.current = false;
		}
	};

	if (!definition) {
		return (
			<div className="flex size-full items-center justify-center text-sm text-muted-foreground">
				The database did not expose this routine's source code.
			</div>
		);
	}

	const hasChanges = code !== definition;

	return (
		<div className="flex size-full flex-col overflow-hidden">
			<header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-4">
				<div className="min-w-0">
					<h1 className="truncate font-mono text-sm font-medium">
						{routine.schemaName ? `${routine.schemaName}.` : ""}
						{routine.routineName}
					</h1>
					<p className="truncate font-mono text-xs text-muted-foreground">
						{routine.signature === null
							? "Arguments unavailable"
							: routine.signature || "No arguments"}
						{routine.returnType ? ` → ${routine.returnType}` : ""}
					</p>
				</div>
				<Badge
					variant="secondary"
					className="capitalize"
				>
					<RoutineTypeIcon routineType={routine.routineType} />
					{routine.routineType}
				</Badge>
				{routine.language && <Badge variant="outline">{routine.language}</Badge>}
				{hasChanges && <Badge variant="outline">Unsaved changes</Badge>}
				<div className="ml-auto flex items-center gap-1">
					<Button
						type="button"
						size="sm"
						onClick={() => void handleExecute(selectedCode.trim() ? selectedCode : code)}
						disabled={isExecutingQuery || !selectedDatabase || !code.trim()}
					>
						<Play className="size-4" />
						{isExecutingQuery ? "Running…" : selectedCode.trim() ? "Run selection" : "Run"}
					</Button>
					{hasChanges && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setCode(definition)}
						>
							<RotateCcw className="size-4" />
							Reset
						</Button>
					)}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => {
							void navigator.clipboard.writeText(code);
							toast.success("Routine code copied");
						}}
					>
						<Copy className="size-4" />
						Copy code
					</Button>
				</div>
			</header>
			<p className="shrink-0 border-b border-border px-4 py-2 text-xs text-muted-foreground">
				Run or Ctrl/Cmd+Enter executes SQL in the selected database: a selection, or all code
				when nothing is selected. To call a routine, enter its invocation with the required
				arguments.
			</p>
			<div className="min-h-0 flex-1">
				<RoutineCodeEditor
					value={code}
					onChange={setCode}
					onExecute={handleExecute}
					onSelectionChange={setSelectedCode}
				/>
			</div>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="h-8 w-full shrink-0 justify-between rounded-none border-t border-border px-4"
				aria-expanded={resultsVisible}
				aria-controls={resultsId}
				onClick={() => setResultsVisible((visible) => !visible)}
			>
				{resultsVisible ? "Hide results" : "Show results"}
				{resultsVisible ? (
					<ChevronDown className="size-4" />
				) : (
					<ChevronUp className="size-4" />
				)}
			</Button>
			<div
				id={resultsId}
				hidden={!resultsVisible}
				className={cn("min-h-0 flex-1 flex-col", resultsVisible ? "flex" : "hidden")}
			>
				<QueryResultContainer
					results={result}
					isLoading={isExecutingQuery}
					error={executeQueryError}
					lastExecutedQuery={lastExecutedQuery}
					layout="inline"
				/>
			</div>
		</div>
	);
};

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
			<div className="size-full flex items-center justify-center text-muted-foreground">
				Loading routines…
			</div>
		);
	}

	if (errorRoutines) {
		return (
			<div className="size-full flex items-center justify-center text-destructive">
				Failed to load routines: {errorRoutines.message}
			</div>
		);
	}

	if (!name) {
		return (
			<div className="size-full flex items-center justify-center text-sm text-muted-foreground">
				Select a procedure or function from the sidebar to view its code.
			</div>
		);
	}

	if (!routine) {
		return (
			<div className="size-full flex items-center justify-center text-sm text-muted-foreground">
				This routine is no longer available. Select another one from the sidebar.
			</div>
		);
	}

	return (
		<RoutineDetail
			key={`${selectedDatabase}\u0000${routine.schemaName ?? ""}\u0000${routine.routineName}\u0000${routine.signature ?? ""}\u0000${routine.routineType}`}
			routine={routine}
		/>
	);
};
