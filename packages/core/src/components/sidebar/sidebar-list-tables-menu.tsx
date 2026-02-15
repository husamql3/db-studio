import { useNavigate } from "@tanstack/react-router";
import {
	ClipboardCopy,
	Download,
	EllipsisVertical,
	FileCode,
	Pencil,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import type { RelatedRecord } from "shared/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopyTableSchema } from "@/hooks/use-copy-table-schema";
import { useDeleteTable } from "@/hooks/use-delete-table";
import { useExportFile } from "@/hooks/use-export-file";

export const SidebarListTablesMenu = ({ tableName }: { tableName: string }) => {
	const navigate = useNavigate();
	const { copyTableSchema, isCopyingSchema } = useCopyTableSchema();
	const { exportFile, isExportingFile } = useExportFile();
	const { deleteTable, forceDeleteTable, isDeletingTable } = useDeleteTable();
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isForceDeleteDialogOpen, setIsForceDeleteDialogOpen] = useState(false);
	const [relatedRecords, setRelatedRecords] = useState<RelatedRecord[]>([]);

	const handleCopyName = () => {
		navigator.clipboard.writeText(tableName);
		toast.success("Table name copied to clipboard");
	};

	const handleDelete = async () => {
		const result = await deleteTable(tableName);

		if (result.fkViolation) {
			setRelatedRecords(result.relatedRecords);
			setIsDeleteDialogOpen(false);
			setIsForceDeleteDialogOpen(true);
		} else {
			toast.success(`Deleted table "${tableName}" with ${result.deletedCount} rows`);
			setIsDeleteDialogOpen(false);
			navigate({ to: "/" });
		}
	};

	const handleForceDelete = async () => {
		const result = await forceDeleteTable(tableName);
		toast.success(`Force deleted table "${tableName}" with ${result.deletedCount} rows`);
		setIsForceDeleteDialogOpen(false);
		navigate({ to: "/" });
	};

	const handleCancelForceDelete = () => {
		setIsForceDeleteDialogOpen(false);
		setRelatedRecords([]);
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger>
					<Button
						variant="ghost"
						size="icon-sm"
					>
						<EllipsisVertical />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					className="w-56"
					align="start"
				>
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={handleCopyName}>
							<ClipboardCopy className="size-4" />
							Copy name
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => copyTableSchema(tableName)}
							disabled={isCopyingSchema}
						>
							<FileCode className="size-4" />
							Copy table schema
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem>
							<Pencil className="size-4" />
							Edit table
						</DropdownMenuItem>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<Download className="size-4" />
								Export data
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<DropdownMenuItem
									onClick={() => exportFile({ tableName, format: "csv" })}
									disabled={isExportingFile}
								>
									Export as CSV
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => exportFile({ tableName, format: "json" })}
									disabled={isExportingFile}
								>
									Export as JSON
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => exportFile({ tableName, format: "xlsx" })}
									disabled={isExportingFile}
								>
									Export as Excel
								</DropdownMenuItem>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							onClick={() => setIsDeleteDialogOpen(true)}
						>
							<Trash2 className="size-4" />
							Delete table
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<DeleteTableDialog
				isOpen={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				tableName={tableName}
				onDelete={handleDelete}
				isDeleting={isDeletingTable}
			/>

			<ForceDeleteTableDialog
				isOpen={isForceDeleteDialogOpen}
				onOpenChange={setIsForceDeleteDialogOpen}
				tableName={tableName}
				relatedRecords={relatedRecords}
				onForceDelete={handleForceDelete}
				onCancel={handleCancelForceDelete}
				isDeleting={isDeletingTable}
			/>
		</>
	);
};

const DeleteTableDialog = ({
	isOpen,
	onOpenChange,
	tableName,
	onDelete,
	isDeleting,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	tableName: string;
	onDelete: () => void;
	isDeleting: boolean;
}) => {
	return (
		<Dialog
			open={isOpen}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Delete Table</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete the table{" "}
						<span className="font-semibold text-foreground">"{tableName}"</span>? This action
						cannot be undone and all data will be permanently lost.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={onDelete}
						disabled={isDeleting}
					>
						{isDeleting ? "Deleting..." : "Delete Table"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

const ForceDeleteTableDialog = ({
	isOpen,
	onOpenChange,
	tableName,
	relatedRecords,
	onForceDelete,
	onCancel,
	isDeleting,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	tableName: string;
	relatedRecords: RelatedRecord[];
	onForceDelete: () => void;
	onCancel: () => void;
	isDeleting: boolean;
}) => {
	return (
		<Dialog
			open={isOpen}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="max-w-xl! max-h-[calc(100vh-1rem)]!">
				<DialogHeader>
					<DialogTitle>Cannot Delete - Foreign Key Constraint</DialogTitle>
					<DialogDescription>
						The table <span className="font-semibold text-foreground">"{tableName}"</span>{" "}
						cannot be deleted because it is referenced by records in other tables. You can
						either cancel the operation or force delete, which will also delete all related
						records.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 max-h-64 overflow-y-auto">
					{relatedRecords.map((related, idx) => (
						<div
							key={`${related.tableName}-${related.columnName}-${idx}`}
							className="border border-zinc-700 rounded-md p-3"
						>
							<div className="font-medium text-sm mb-2">
								Table: <span className="text-primary">{related.tableName}</span>
								<span className="text-muted-foreground ml-2">
									({related.records.length} record
									{related.records.length !== 1 ? "s" : ""})
								</span>
							</div>
							<div className="text-xs text-muted-foreground mb-2">
								References column: {related.columnName}
							</div>
							<div className="bg-zinc-900 rounded p-2 text-xs overflow-x-auto">
								<pre className="whitespace-pre-wrap">
									{JSON.stringify(related.records.slice(0, 5), null, 2)}
									{related.records.length > 5 && (
										<div className="text-muted-foreground mt-2">
											... and {related.records.length - 5} more
										</div>
									)}
								</pre>
							</div>
						</div>
					))}
				</div>

				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={onCancel}
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={onForceDelete}
						disabled={isDeleting}
					>
						{isDeleting ? "Deleting..." : "Force Delete All"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
