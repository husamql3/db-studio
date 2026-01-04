import {
	IconCopy,
	IconPencil,
	IconPlus,
	IconStarFilled,
	IconTrash,
} from "@tabler/icons-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useQueryState } from "nuqs";
import { useCallback, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useQueriesStore } from "@/stores/queries.store";
import { CONSTANTS } from "@/utils/constants";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../ui/context-menu";

export const SidebarListQueries = () => {
	const [searchTerm] = useQueryState(CONSTANTS.SIDEBAR_SEARCH, {
		defaultValue: "",
	});
	const { folders, queries, getFavoriteQueries, getQueriesByFolder, toggleFolder } =
		useQueriesStore();

	const [favoritesExpanded, setFavoritesExpanded] = useState(true);
	const [queriesExpanded, setQueriesExpanded] = useState(true);

	const queriesCount = queries.length;
	const favoriteQueries = getFavoriteQueries();
	const favoriteQueriesCount = favoriteQueries.length;
	const queriesWithoutFolders = queries.filter((q) => !q.folderId);

	if (searchTerm) {
		const filteredQueries = queries.filter((q) =>
			q.name.toLowerCase().includes(searchTerm.toLowerCase()),
		);
		if (filteredQueries.length === 0) {
			return <div className="flex-1 overflow-y-auto p-4">No queries found matching</div>;
		}

		return (
			<div className="flex-1 overflow-y-auto">
				{filteredQueries.map((query) => (
					<SidebarListTablesItem
						key={query.id}
						id={query.id}
						tableName={query.name}
					/>
				))}
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto">
			{/* Favorite button */}
			<FolderToggleButton
				name="Favorites"
				isExpanded={favoritesExpanded}
				onToggle={() => setFavoritesExpanded(!favoritesExpanded)}
				count={favoriteQueriesCount}
			/>

			{/* Favorite queries */}
			{favoritesExpanded &&
				favoriteQueries.map((query) => (
					<SidebarListTablesItem
						key={query.id}
						id={query.id}
						tableName={query.name}
					/>
				))}

			<Separator className="bg-zinc-800" />

			{/* Queries */}
			<FolderToggleButton
				name="Queries"
				isExpanded={queriesExpanded}
				onToggle={() => setQueriesExpanded(!queriesExpanded)}
				count={queriesCount}
			/>

			{queriesExpanded && (
				<>
					{folders.map((folder) => {
						const folderQueries = getQueriesByFolder(folder.id);
						const folderQueriesCount = folderQueries.length;

						return (
							<div key={folder.id}>
								<FolderToggleButton
									folderId={folder.id}
									name={folder.name}
									isExpanded={folder.isExpanded}
									onToggle={() => toggleFolder(folder.id)}
									count={folderQueriesCount}
									showContextMenu={true}
								/>
								{folder.isExpanded &&
									folderQueries.map((query) => (
										<SidebarListTablesItem
											key={query.id}
											id={query.id}
											tableName={query.name}
											isNested={true}
											showContextMenu={true}
										/>
									))}
							</div>
						);
					})}

					{queriesWithoutFolders.map((query) => (
						<SidebarListTablesItem
							key={query.id}
							id={query.id}
							tableName={query.name}
							showContextMenu={true}
						/>
					))}
				</>
			)}
		</div>
	);
};

const SidebarListTablesItem = ({
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
	const { deleteQuery, addQuery, getQuery, toggleFavorite } = useQueriesStore();
	const navigate = useNavigate();
	const { queryId } = useParams({ strict: false });
	const isSelected = queryId === id;

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
						<ContextMenuItem>
							<IconPencil className="size-4" />
							Rename query
						</ContextMenuItem>
						<ContextMenuItem onClick={handleDuplicate}>
							<IconCopy className="size-4" />
							Duplicate query
						</ContextMenuItem>
						<ContextMenuItem onClick={handleAddToFavorites}>
							<IconStarFilled className="size-4" />
							Add to favorites
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
		</li>
	);
};

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
	const { deleteFolder, getQueriesByFolder } = useQueriesStore();

	const handleDelete = useCallback(() => {
		if (folderId) {
			const queries = getQueriesByFolder(folderId);
			if (queries.length > 0) {
				console.log("queries", queries);
				// todo show a modal for confirmation
				return;
			}

			deleteFolder(folderId);
		}
	}, [deleteFolder, folderId, getQueriesByFolder]);

	return showContextMenu ? (
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
				<ContextMenuItem>
					<IconPlus className="size-4" />
					Create a new query
				</ContextMenuItem>
				<ContextMenuItem>
					<IconPencil className="size-4" />
					Rename folder
				</ContextMenuItem>
				<ContextMenuItem onClick={handleDelete}>
					<IconTrash className="size-4" />
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
	);
};
