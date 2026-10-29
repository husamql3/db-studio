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
			<AlertDialogContent className="gap-0 overflow-hidden rounded-sm p-0 data-[size=default]:sm:max-w-lg">
				<AlertDialogHeader className="gap-1 border-b px-4 py-3">
					<AlertDialogTitle>
						{problems.length} pasted {problems.length === 1 ? "value doesn't" : "values don't"}{" "}
						fit
					</AlertDialogTitle>
					<AlertDialogDescription>
						These cells keep their current values. Nothing is saved until you press Save.
						{preview?.skipped
							? ` ${preview.skipped} cells past the grid's edge are skipped.`
							: ""}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="max-h-64 overflow-auto">
					<table className="w-full table-fixed font-mono text-xs">
						<thead className="sticky top-0 bg-background text-left text-[0.625rem] text-muted-foreground">
							<tr className="h-7 border-b">
								<th className="w-12 px-3 text-right font-normal sm:w-14 sm:px-4">Row</th>
								<th className="w-20 px-2 font-normal sm:w-28">Column</th>
								<th className="w-24 px-2 font-normal sm:w-36">Value</th>
								<th className="px-2 pr-4 font-normal">Problem</th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{problems.map((problem) => (
								<tr
									key={`${problem.rowNumber}:${problem.columnId}`}
									className="h-8 whitespace-nowrap"
								>
									<td className="px-3 text-right tabular-nums text-muted-foreground sm:px-4">
										{problem.rowNumber}
									</td>
									<td
										className="truncate px-2"
										title={problem.columnId}
									>
										{problem.columnId}
									</td>
									<td
										className="truncate px-2"
										title={problem.text}
									>
										{problem.text ? (
											<span className="underline decoration-destructive/70 decoration-wavy underline-offset-4">
												{problem.text}
											</span>
										) : (
											<span className="text-[0.625rem] text-muted-foreground/70">EMPTY</span>
										)}
									</td>
									<td className="whitespace-normal break-words px-2 py-1.5 pr-4 text-destructive">
										{problem.error}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<AlertDialogFooter className="border-t bg-muted/30 px-4 py-2.5">
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
