import type { RoutineInfoSchemaType } from "@db-studio/shared/types";
import { Badge } from "@db-studio/ui/badge";
import { Button } from "@db-studio/ui/button";
import { useSearch } from "@tanstack/react-router";
import { Copy, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RoutineCodeEditor } from "../components/routine-code-editor";
import { useRoutines } from "../hooks/use-routines";

const RoutineDetail = ({ routine }: { routine: RoutineInfoSchemaType }) => {
	const definition = routine.definition;
	const [code, setCode] = useState(definition ?? "");

	useEffect(() => setCode(definition ?? ""), [definition]);

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
						{routine.signature || "No arguments"}
						{routine.returnType ? ` → ${routine.returnType}` : ""}
					</p>
				</div>
				<Badge
					variant="secondary"
					className="capitalize"
				>
					{routine.routineType}
				</Badge>
				{routine.language && <Badge variant="outline">{routine.language}</Badge>}
				{hasChanges && <Badge variant="outline">Unsaved changes</Badge>}
				<div className="ml-auto flex items-center gap-1">
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
			<div className="min-h-0 flex-1">
				<RoutineCodeEditor
					value={code}
					onChange={setCode}
				/>
			</div>
		</div>
	);
};

export const RoutinesScreen = () => {
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
			key={`${routine.schemaName ?? ""}\u0000${routine.routineName}\u0000${routine.signature ?? ""}\u0000${routine.routineType}`}
			routine={routine}
		/>
	);
};
