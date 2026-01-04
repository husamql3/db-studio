import {
	IconCopy,
	IconPencil,
	IconStar,
	IconStarFilled,
	IconTrash,
} from "@tabler/icons-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useState } from "react";
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
	const { deleteQuery, addQuery, getQuery, toggleFavorite, updateQuery } =
		useQueriesStore();
	const { queryId } = useParams({ strict: false });
	const isSelected = queryId === id;
	const query = getQuery(id);
	const isFavorite = query?.isFavorite ?? false;

	const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
	const [renameValue, setRenameValue] = useState("");

	const handleSelect = useCallback(() => {
		navigate({ to: "/runner/$queryId", params: { queryId: id } });
	}, [navigate, id]);

	const handleDelete = useCallback(() => {
		deleteQuery(id);
		if (queryId === id) {
			navigate({ to: "/runner" });
		}
	}, [deleteQuery, id, navigate, queryId]);

	const handleDuplicate = useCallback(() => {
		const query = getQuery(id);
		const newQueryId = addQuery(`${query?.name} (Copy)`);
		navigate({ to: "/runner/$queryId", params: { queryId: newQueryId } });
	}, [addQuery, getQuery, navigate, id]);

	const handleAddToFavorites = useCallback(() => {
		toggleFavorite(id);
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
		}
	}, [id, renameValue, updateQuery]);

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
		</li>
	);
};
