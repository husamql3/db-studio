import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useQueriesStore } from "@/stores/queries.store";

export const FolderToggleButton = ({
	folderId,
	isExpanded,
	onToggle,
	count,
	name,
	showContextMenu = false,
}: {
	folderId?: string;
	isExpanded: boolean;
	onToggle: () => void;
	count: number;
	name: string;
	showContextMenu?: boolean;
}) => {
	const navigate = useNavigate();
	const { deleteFolder, getQueriesByFolder, addQuery, updateFolder } =
		useQueriesStore();

	const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
	const [renameValue, setRenameValue] = useState("");
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	const handleDelete = useCallback(() => {
		if (folderId) {
			const queries = getQueriesByFolder(folderId);
			if (queries.length > 0) {
				setIsDeleteDialogOpen(true);
				return;
			}

			deleteFolder(folderId);
		}
	}, [deleteFolder, folderId, getQueriesByFolder]);

	const handleDeleteConfirm = useCallback(() => {
		if (folderId) {
			deleteFolder(folderId);
			setIsDeleteDialogOpen(false);
		}
	}, [deleteFolder, folderId]);

	const handleAddFolderQuery = useCallback(() => {
		const queryId = addQuery(undefined, folderId);
		navigate({ to: "/runner/$queryId", params: { queryId } });
	}, [addQuery, folderId, navigate]);

	const handleRenameClick = useCallback(() => {
		setRenameValue(name);
		setIsRenameDialogOpen(true);
	}, [name]);

	const handleRenameSubmit = useCallback(() => {
		if (folderId && renameValue.trim()) {
			updateFolder(folderId, { name: renameValue.trim() });
			setIsRenameDialogOpen(false);
			setRenameValue("");
		}
	}, [folderId, renameValue, updateFolder]);

	return (
		<>
			{showContextMenu ? (
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<button
							type="button"
							onClick={onToggle}
							className={cn(
								"w-full flex gap-2 px-4 py-2 text-sm transition-colors text-left",
								"hover:bg-zinc-800/50 hover:text-zinc-100 focus:outline-none focus:bg-zinc-800/50",
								"text-zinc-400 items-center",
							)}
						>
							<ChevronRight
								className={cn(
									"size-4 transition-transform duration-200",
									isExpanded ? "rotate-90" : "",
								)}
							/>
							<span className="flex-1">{name}</span>
							<Kbd>{count}</Kbd>
						</button>
					</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem onClick={handleAddFolderQuery}>
							<Plus className="size-4" />
							Add a new query
						</ContextMenuItem>
						<ContextMenuItem onClick={handleRenameClick}>
							<Pencil className="size-4" />
							Rename folder
						</ContextMenuItem>
						<ContextMenuItem onClick={handleDelete}>
							<Trash2 className="size-4" />
							Delete folder
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			) : (
				<button
					type="button"
					onClick={onToggle}
					className={cn(
						"w-full flex gap-2 px-4 py-2 text-sm transition-colors text-left",
						"hover:bg-zinc-800/50 hover:text-zinc-100 focus:outline-none focus:bg-zinc-800/50",
						"text-zinc-400 items-center",
					)}
				>
					<ChevronRight
						className={cn(
							"size-4 transition-transform duration-200",
							isExpanded ? "rotate-90" : "",
						)}
					/>
					<span className="flex-1">{name}</span>
					<Kbd>{count}</Kbd>
				</button>
			)}

			<Dialog
				open={isRenameDialogOpen}
				onOpenChange={setIsRenameDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Rename Folder</DialogTitle>
						<DialogDescription>
							Enter a new name for this folder.
						</DialogDescription>
					</DialogHeader>
					<Input
						value={renameValue}
						onChange={(e) => setRenameValue(e.target.value)}
						placeholder="Folder name"
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleRenameSubmit();
							}
						}}
						autoFocus
					/>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsRenameDialogOpen(false);
								setRenameValue("");
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={handleRenameSubmit}
							disabled={!renameValue.trim()}
						>
							Rename
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Folder</AlertDialogTitle>
						<AlertDialogDescription>
							This folder contains {count} {count === 1 ? "query" : "queries"}.
							Deleting this folder will also delete all queries inside it. This
							action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteConfirm}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete Folder
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
