import { EllipsisVertical, Pencil, Trash2, Type } from "lucide-react";
import { useState } from "react";
import type { ColumnInfoSchemaType } from "shared/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeleteColumn } from "@/hooks/use-delete-column";
import { useRenameColumn } from "@/hooks/use-rename-column";
import { useSchemaEditStore } from "@/stores/schema-edit.store";
import { useSheetStore } from "@/stores/sheet.store";

export const SchemaRowActions = ({
	col,
	tableName,
}: {
	col: ColumnInfoSchemaType;
	tableName: string;
}) => {
	const { openSheet } = useSheetStore();
	const { setEditingColumn } = useSchemaEditStore();
	const { renameColumn, isRenamingColumn } = useRenameColumn({
		tableName,
		columnName: col.columnName,
	});
	const { deleteColumn, isDeletingColumn } = useDeleteColumn();
	const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
	const [isDropDialogOpen, setIsDropDialogOpen] = useState(false);
	const [newColumnName, setNewColumnName] = useState(col.columnName);
	const [cascadeDelete, setCascadeDelete] = useState(false);

	const handleEditColumn = () => {
		setEditingColumn(col);
		openSheet("edit-column");
	};

	const handleRenameDialogChange = (open: boolean) => {
		setIsRenameDialogOpen(open);
		if (!open) {
			setNewColumnName(col.columnName);
		}
	};

	const handleDropDialogChange = (open: boolean) => {
		setIsDropDialogOpen(open);
		if (!open) {
			setCascadeDelete(false);
		}
	};

	const handleRenameColumn = async () => {
		await renameColumn({ newColumnName: newColumnName.trim() });
		handleRenameDialogChange(false);
	};

	const handleDropColumn = async () => {
		await deleteColumn({
			db: "",
			tableName,
			columnName: col.columnName,
			cascade: cascadeDelete,
		});
		handleDropDialogChange(false);
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
							onClick={() => handleDropDialogChange(true)}
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
				columnName={col.columnName}
				isOpen={isDropDialogOpen}
				onOpenChange={handleDropDialogChange}
				cascadeDelete={cascadeDelete}
				setCascadeDelete={setCascadeDelete}
				onDrop={handleDropColumn}
				isDropping={isDeletingColumn}
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

const DropColumnDialog = ({
	columnName,
	isOpen,
	onOpenChange,
	cascadeDelete,
	setCascadeDelete,
	onDrop,
	isDropping,
}: {
	columnName: string;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	cascadeDelete: boolean;
	setCascadeDelete: (value: boolean) => void;
	onDrop: () => void;
	isDropping: boolean;
}) => {
	return (
		<Dialog
			open={isOpen}
			onOpenChange={onOpenChange}
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

				<div className="flex gap-3 rounded-lg border border-zinc-800 px-3 py-3">
					<Checkbox
						id={`drop-column-cascade-${columnName}`}
						checked={cascadeDelete}
						onCheckedChange={(checked) => setCascadeDelete(checked === true)}
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

				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isDropping}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={onDrop}
						disabled={isDropping}
					>
						{isDropping ? "Dropping..." : "Drop Column"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
