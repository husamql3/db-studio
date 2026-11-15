import { Button } from "@db-studio/ui/button";
import { Checkbox } from "@db-studio/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@db-studio/ui/dialog";
import { Label } from "@db-studio/ui/label";
import { useState } from "react";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { useDeleteColumn } from "../hooks/use-delete-column";

export const DropColumnDialog = ({
	tableName,
	schemaName,
	columnName,
	open,
	onOpenChange,
}: {
	tableName: string;
	schemaName: string | undefined;
	columnName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const { deleteColumn, isDeletingColumn } = useDeleteColumn();
	const [cascade, setCascade] = useState(false);
	const cascadeOffered = useDatabaseEngine()?.dropColumnCascade;

	const handleOpenChange = (next: boolean) => {
		if (!next) setCascade(false);
		onOpenChange(next);
	};

	const handleDrop = () => {
		deleteColumn({ tableName, schemaName, columnName, cascade });
		handleOpenChange(false);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={handleOpenChange}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Drop Column</DialogTitle>
					<DialogDescription>
						Are you sure you want to drop the column{" "}
						<span className="font-semibold text-foreground">"{columnName}"</span>? This action
						cannot be undone and permanently removes the data stored in it.
					</DialogDescription>
				</DialogHeader>

				{cascadeOffered && (
					<div className="flex gap-3 rounded-lg border border-border p-3">
						<Checkbox
							id={`drop-column-cascade-${columnName}`}
							checked={cascade}
							onCheckedChange={(checked) => setCascade(checked === true)}
						/>
						<div className="space-y-1">
							<Label
								htmlFor={`drop-column-cascade-${columnName}`}
								className="cursor-pointer"
							>
								Drop with CASCADE
							</Label>
							<p className="text-xs text-muted-foreground">
								Also remove dependent indexes, constraints, and foreign key references.
							</p>
						</div>
					</div>
				)}

				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={isDeletingColumn}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleDrop}
						disabled={isDeletingColumn}
					>
						{isDeletingColumn ? "Dropping..." : "Drop Column"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
