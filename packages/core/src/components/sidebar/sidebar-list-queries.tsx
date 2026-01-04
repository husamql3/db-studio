import { useNavigate, useParams } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useQueryState } from "nuqs";
import { useCallback, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
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
			<FolderToggleButton
				name="Favorites"
				isExpanded={favoritesExpanded}
				onToggle={() => setFavoritesExpanded(!favoritesExpanded)}
				count={favoriteQueriesCount}
			/>
			{favoritesExpanded &&
				favoriteQueries.map((query) => (
					<SidebarListTablesItem
						key={query.id}
						id={query.id}
						tableName={query.name}
					/>
				))}

			<Separator className="bg-zinc-800" />

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
									name={folder.name}
									isExpanded={folder.isExpanded}
									onToggle={() => toggleFolder(folder.id)}
									count={folderQueriesCount}
								/>
								{folder.isExpanded &&
									folderQueries.map((query) => (
										<SidebarListTablesItem
											key={query.id}
											id={query.id}
											tableName={query.name}
											isNested={true}
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
}: {
	id: string;
	tableName: string;
	isNested?: boolean;
}) => {
	const navigate = useNavigate();
	const { queryId } = useParams({ strict: false });
	const isSelected = queryId === id;

	const handleSelect = useCallback(() => {
		navigate({ to: "/runner/$queryId", params: { queryId: id } });
	}, [navigate, id]);

	return (
		<li className="relative">
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
				{isSelected && <span className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />}
				<span className="flex-1">{tableName}</span>
			</button>
		</li>
	);
};

export const FolderToggleButton = ({
	isExpanded,
	onToggle,
	count,
	name,
}: {
	isExpanded: boolean;
	onToggle: () => void;
	count: number;
	name: string;
}) => {
	return (
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
