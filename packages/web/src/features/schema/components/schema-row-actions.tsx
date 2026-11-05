import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@db-studio/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@db-studio/ui/dropdown-menu";
import { Input } from "@db-studio/ui/input";
import { Label } from "@db-studio/ui/label";
import { EllipsisVertical, Pencil, Trash2, Type } from "lucide-react";
import { useState } from "react";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { useOverlayStore } from "@/stores/overlay.store";
import { useRenameColumn } from "../hooks/use-rename-column";
import { useSchemaEditStore } from "../stores/schema-edit.store";
import { DropColumnDialog } from "./drop-column-dialog";

export const SchemaRowActions = ({
	col,
	tableName,
}: {
	col: ColumnInfoSchemaType;
	tableName: string;
}) => {
	const { openOverlay } = useOverlayStore();
	const { setEditingColumn } = useSchemaEditStore();
	const schemaName = useTableSchemaName();

	const { renameColumn, isRenamingColumn } = useRenameColumn({
		tableName,
		schemaName,
		columnName: col.columnName,
	});

	const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
	const [isDropDialogOpen, setIsDropDialogOpen] = useState(false);
	const [newColumnName, setNewColumnName] = useState(col.columnName);

	const handleEditColumn = () => {
		setEditingColumn(col);
		openOverlay("schema.edit-column");
	};

	const handleRenameDialogChange = (open: boolean) => {
		setIsRenameDialogOpen(open);

		if (!open) {
			setNewColumnName(col.columnName);
		}
	};

	const handleRenameColumn = async () => {
		await renameColumn({ newColumnName: newColumnName.trim() });
		handleRenameDialogChange(false);
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
					>
						<EllipsisVertical className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					className="w-48"
				>
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={handleEditColumn}>
							<Pencil className="size-4" />
							Edit Column
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => handleRenameDialogChange(true)}>
							<Type className="size-4" />
							Rename Column
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							onClick={() => setIsDropDialogOpen(true)}
						>
							<Trash2 className="size-4" />
							Drop Column
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<RenameColumnDialog
				columnName={col.columnName}
				newColumnName={newColumnName}
				setNewColumnName={setNewColumnName}
				isOpen={isRenameDialogOpen}
				onOpenChange={handleRenameDialogChange}
				onRename={handleRenameColumn}
				isRenaming={isRenamingColumn}
			/>

			<DropColumnDialog
				tableName={tableName}
				schemaName={schemaName}
				columnName={col.columnName}
				open={isDropDialogOpen}
				onOpenChange={setIsDropDialogOpen}
			/>
		</>
	);
};

const RenameColumnDialog = ({
	columnName,
	newColumnName,
	setNewColumnName,
	isOpen,
	onOpenChange,
	onRename,
	isRenaming,
}: {
	columnName: string;
	newColumnName: string;
	setNewColumnName: (value: string) => void;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onRename: () => void;
	isRenaming: boolean;
}) => {
	const isDisabled = !newColumnName.trim() || newColumnName.trim() === columnName;

	return (
		<Dialog
			open={isOpen}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Rename Column</DialogTitle>
					<DialogDescription>
						Update the column name while keeping the rest of the schema unchanged.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="current-column-name">Current name</Label>
						<Input
							id="current-column-name"
							value={columnName}
							readOnly
							disabled
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="new-column-name">New name</Label>
						<Input
							id="new-column-name"
							value={newColumnName}
							onChange={(e) => setNewColumnName(e.target.value)}
							placeholder="column_name"
							autoFocus
						/>
					</div>
				</div>

				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isRenaming}
					>
						Cancel
					</Button>
					<Button
						onClick={onRename}
						disabled={isDisabled || isRenaming}
					>
						{isRenaming ? "Renaming..." : "Rename Column"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
