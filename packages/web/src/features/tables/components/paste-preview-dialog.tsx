import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@db-studio/ui/alert-dialog";
import type { PastePreview } from "../hooks/use-grid-clipboard";

export const PastePreviewDialog = ({
	preview,
	onStage,
	onClose,
}: {
	preview: PastePreview | null;
	onStage: () => void;
	onClose: () => void;
}) => {
	const problems = preview?.problems ?? [];
	const changes = preview?.changes.length ?? 0;

	return (
		<AlertDialog
			open={preview !== null}
			onOpenChange={(isOpen) => {
				if (!isOpen) onClose();
			}}
		>
			<AlertDialogContent className="sm:max-w-xl">
				<AlertDialogHeader>
					<AlertDialogTitle>
						{problems.length} pasted {problems.length === 1 ? "value doesn't" : "values don't"}{" "}
						fit
					</AlertDialogTitle>
					<AlertDialogDescription>
						These cells keep their current values. Stage the other {changes}{" "}
						{changes === 1 ? "change" : "changes"}? Nothing is saved until you press Save.
						{preview?.skipped
							? ` ${preview.skipped} cells past the grid's edge are skipped.`
							: ""}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="max-h-64 overflow-auto border text-sm">
					<table className="w-full">
						<thead className="sticky top-0 bg-muted text-left text-muted-foreground">
							<tr>
								<th className="px-2 py-1 font-normal">Row</th>
								<th className="px-2 py-1 font-normal">Column</th>
								<th className="px-2 py-1 font-normal">Pasted value</th>
								<th className="px-2 py-1 font-normal">Problem</th>
							</tr>
						</thead>
						<tbody>
							{problems.map((problem) => (
								<tr
									key={`${problem.rowNumber}:${problem.columnId}`}
									className="border-t"
								>
									<td className="px-2 py-1 tabular-nums">{problem.rowNumber}</td>
									<td className="px-2 py-1 font-mono">{problem.columnId}</td>
									<td className="max-w-40 truncate px-2 py-1 font-mono">
										{problem.text || <span className="text-muted-foreground">empty</span>}
									</td>
									<td className="px-2 py-1 text-destructive">{problem.error}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel paste</AlertDialogCancel>
					<AlertDialogAction
						disabled={changes === 0}
						onClick={onStage}
					>
						Stage {changes} {changes === 1 ? "change" : "changes"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
