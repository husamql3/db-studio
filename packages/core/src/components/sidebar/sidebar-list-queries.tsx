import { useQueryState } from "nuqs";
import { useState } from "react";
import { FolderToggleButton } from "@/components/sidebar/folder-toggle-button";
import { SidebarListQueryItem } from "@/components/sidebar/sidebar-list-query-item";
import { Separator } from "@/components/ui/separator";
import { useQueriesStore } from "@/stores/queries.store";
import { CONSTANTS } from "@/utils/constants";

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
	const queriesWithoutFolders = queries.filter((q) => !q.folderId && !q.isFavorite);

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
					<SidebarListQueryItem
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
					<SidebarListQueryItem
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
										<SidebarListQueryItem
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
						<SidebarListQueryItem
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
