import {
	IconCopy,
	IconFolder,
	IconFolderPlus,
	IconPencil,
	IconStar,
	IconStarFilled,
	IconTrash,
} from "@tabler/icons-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useQueriesStore } from "@/stores/queries.store";

export const SidebarListQueryItem = ({
	id,
	tableName,
	isNested = false,
	showContextMenu = true,
}: {
	id: string;
	tableName: string;
	isNested?: boolean;
	showContextMenu?: boolean;
}) => {
	const navigate = useNavigate();
	const {
		deleteQuery,
		addQuery,
		getQuery,
		toggleFavorite,
		updateQuery,
		moveQuery,
		folders,
		addFolder,
	} = useQueriesStore();
	const { queryId } = useParams({ strict: false });
	const isSelected = queryId === id;
	const query = getQuery(id);
	const isFavorite = query?.isFavorite ?? false;

	const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
	const [renameValue, setRenameValue] = useState("");
	const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
	const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined);
	const [isCreatingFolder, setIsCreatingFolder] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	const handleSelect = useCallback(() => {
		navigate({ to: "/runner/$queryId", params: { queryId: id } });
	}, [navigate, id]);

	const handleDelete = useCallback(() => {
		deleteQuery(id);
		if (queryId === id) {
			navigate({ to: "/runner" });
		}
		toast.success("Query deleted successfully");
	}, [deleteQuery, id, navigate, queryId]);

	const handleDuplicate = useCallback(() => {
		const query = getQuery(id);
		const newQueryId = addQuery(`${query?.name} (Copy)`);
		navigate({ to: "/runner/$queryId", params: { queryId: newQueryId } });
		toast.success("Query duplicated successfully");
	}, [addQuery, getQuery, navigate, id]);

	const handleAddToFavorites = useCallback(() => {
		toggleFavorite(id);
		toast.success("Query favorited successfully");
	}, [toggleFavorite, id]);

	const handleRenameClick = useCallback(() => {
		setRenameValue(query?.name ?? "");
		setIsRenameDialogOpen(true);
	}, [query?.name]);

	const handleRenameSubmit = useCallback(() => {
		if (renameValue.trim()) {
			updateQuery(id, { name: renameValue.trim() });
			setIsRenameDialogOpen(false);
			setRenameValue("");
			toast.success("Query renamed successfully");
		}
	}, [id, renameValue, updateQuery]);

	const handleMoveClick = useCallback(() => {
		setSelectedFolderId(query?.folderId);
		setIsCreatingFolder(false);
		setNewFolderName("");
		setIsMoveDialogOpen(true);
	}, [query?.folderId]);

	const handleFolderSelect = useCallback((folderId: string) => {
		if (folderId === "__create_new__") {
			setIsCreatingFolder(true);
			setSelectedFolderId(undefined);
		} else {
			setIsCreatingFolder(false);
			setSelectedFolderId(folderId === "__none__" ? undefined : folderId);
		}
	}, []);

	const handleMoveSubmit = useCallback(() => {
		if (isCreatingFolder && newFolderName.trim()) {
			// Create new folder and move query
			const newFolderId = Math.random().toString(36).substring(2, 15);
			addFolder({
				id: newFolderId,
				name: newFolderName.trim(),
				isExpanded: true,
				isFavorite: false,
			});
			moveQuery(id, newFolderId);
			toast.success("Query moved to new folder successfully");
		} else if (!isCreatingFolder) {
			// Move to selected folder (or remove from folder if undefined)
			moveQuery(id, selectedFolderId);
			toast.success("Query moved to selected folder successfully");
		}
		setIsMoveDialogOpen(false);
		setIsCreatingFolder(false);
		setNewFolderName("");
		setSelectedFolderId(undefined);
	}, [isCreatingFolder, newFolderName, selectedFolderId, id, addFolder, moveQuery]);

	return (
		<li className="relative">
			{showContextMenu ? (
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<button
							type="button"
							onClick={handleSelect}
							className={cn(
								"w-full flex gap-2 py-2 text-sm transition-colors text-left",
								"hover:text-zinc-100 focus:outline-none focus:bg-accent/10 focus:text-zinc-100 justify-start items-center",
								isSelected ? "text-zinc-100 bg-accent/10" : "text-zinc-400",
								isNested ? "px-4 pl-12" : "px-4",
							)}
						>
							{isSelected && (
								<span className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />
							)}
							<span className="flex-1">{tableName}</span>
						</button>
					</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem onClick={handleRenameClick}>
							<IconPencil className="size-4" />
							Rename query
						</ContextMenuItem>
						<ContextMenuItem onClick={handleDuplicate}>
							<IconCopy className="size-4" />
							Duplicate query
						</ContextMenuItem>
						<ContextMenuItem onClick={handleAddToFavorites}>
							{isFavorite ? (
								<IconStarFilled className="size-4" />
							) : (
								<IconStar className="size-4" />
							)}
							{isFavorite ? "Remove from favorites" : "Add to favorites"}
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onClick={handleMoveClick}>
							<IconFolder className="size-4" />
							Move to folder
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onClick={handleDelete}>
							<IconTrash className="size-4" />
							Delete query
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			) : (
				<button
					type="button"
					onClick={handleSelect}
					className={cn(
						"w-full flex gap-2 py-2 text-sm transition-colors text-left",
						"hover:text-zinc-100 focus:outline-none focus:bg-accent/10 focus:text-zinc-100 justify-start items-center",
						isSelected ? "text-zinc-100 bg-accent/10" : "text-zinc-400",
						isNested ? "px-4 pl-12" : "px-4",
					)}
				>
					{isSelected && (
						<span className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />
					)}
					<span className="flex-1">{tableName}</span>
				</button>
			)}

			<Dialog
				open={isRenameDialogOpen}
				onOpenChange={setIsRenameDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Rename Query</DialogTitle>
						<DialogDescription>Enter a new name for this query.</DialogDescription>
					</DialogHeader>
					<Input
						value={renameValue}
						onChange={(e) => setRenameValue(e.target.value)}
						placeholder="Query name"
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

			<Dialog
				open={isMoveDialogOpen}
				onOpenChange={(open) => {
					setIsMoveDialogOpen(open);
					if (!open) {
						setIsCreatingFolder(false);
						setNewFolderName("");
						setSelectedFolderId(undefined);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Move to Folder</DialogTitle>
						<DialogDescription>Select a folder to move this query to.</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						{!isCreatingFolder ? (
							<Select
								value={selectedFolderId ?? "__none__"}
								onValueChange={handleFolderSelect}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select a folder" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__none__">No folder</SelectItem>
									{folders.map((folder) => (
										<SelectItem
											key={folder.id}
											value={folder.id}
										>
											{folder.name}
										</SelectItem>
									))}
									<SelectItem value="__create_new__">
										<div className="flex items-center gap-2">
											<IconFolderPlus className="size-4" />
											Create a new folder
										</div>
									</SelectItem>
								</SelectContent>
							</Select>
						) : (
							<Input
								value={newFolderName}
								onChange={(e) => setNewFolderName(e.target.value)}
								placeholder="Folder name"
								onKeyDown={(e) => {
									if (e.key === "Enter" && newFolderName.trim()) {
										handleMoveSubmit();
									}
									if (e.key === "Escape") {
										setIsCreatingFolder(false);
										setNewFolderName("");
									}
								}}
								autoFocus
							/>
						)}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsMoveDialogOpen(false);
								setIsCreatingFolder(false);
								setNewFolderName("");
								setSelectedFolderId(undefined);
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={handleMoveSubmit}
							disabled={isCreatingFolder && !newFolderName.trim()}
						>
							{isCreatingFolder ? "Create & Move" : "Move"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</li>
	);
};
