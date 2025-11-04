import { useQuery } from "@tanstack/react-query";
import { Pin, PinOff, Plus, Search } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "../../hooks/use-search-params";
import { getTables } from "../../services/get-tables";
import { CONSTANTS } from "../../utils/constants";
import { deleteSearchParam, setSearchParam } from "../../utils/search-params";
import { TablesList } from "../tables-list";

export const Sidebar = ({
	isOpen,
	setIsOpen,
	isPinned,
	setIsPinned,
}: {
	isOpen: boolean;
	setIsOpen: (isOpen: boolean) => void;
	isPinned: boolean;
	setIsPinned: (isPinned: boolean) => void;
}) => {
	const { activeTable, tables: selectedTables } = useSearchParams();

	// Convert tables array to Set for efficient lookups
	const selectedTableIds = useMemo(() => new Set(selectedTables), [selectedTables]);

	const {
		data: tables,
		isLoading,
		error,
	} = useQuery({
		queryKey: [CONSTANTS.TABLES],
		queryFn: getTables,
	});

	const handleSelect = (id: string) => {
		const isCurrentlySelected = selectedTableIds.has(id);
		const nextTables = new Set(selectedTableIds);

		if (isCurrentlySelected) {
			// Deselect if already selected
			nextTables.delete(id);

			// If we're removing the active table, clear activeTable or set to first remaining
			if (activeTable === id) {
				if (nextTables.size > 0) {
					// Set first remaining table as active
					setSearchParam(CONSTANTS.ACTIVE_TABLE, Array.from(nextTables)[0]);
				} else {
					// No tables left, remove activeTable param
					deleteSearchParam(CONSTANTS.ACTIVE_TABLE);
				}
			}
		} else {
			// Select if not selected and set as active
			nextTables.add(id);
			setSearchParam(CONSTANTS.ACTIVE_TABLE, id);
		}

		// Update URL query params
		if (nextTables.size > 0) {
			setSearchParam(CONSTANTS.TABLES, Array.from(nextTables).join(","));
		} else {
			// Remove param if no tables selected
			deleteSearchParam(CONSTANTS.TABLES);
		}
	};

	return (
		<aside
			className={`
      fixed left-0 top-0 bg-black border-r border-zinc-800 z-50 h-dvh
      transition-transform duration-300 ease-out w-[260px]
      ${isOpen || isPinned ? "translate-x-0" : "-translate-x-full"}
    `}
		>
			<div className="flex flex-col h-full">
				{/* Sidebar Header */}
				<div className="flex items-center justify-between h-8 space-y-2 border-b border-zinc-800">
					<button
						type="button"
						onClick={() => setIsPinned(!isPinned)}
						className="size-8 flex items-center justify-center rounded-lg transition-colors"
						title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
					>
						{isPinned ? <Pin className="size-4" /> : <PinOff className="size-4" />}
					</button>

					{!isPinned && (
						<button
							type="button"
							onClick={() => setIsOpen(false)}
							className="size-8 flex items-center justify-center rounded-lg transition-colors"
							title="Close sidebar"
						>
							<Plus className="size-4 rotate-45" />
						</button>
					)}
				</div>

				{/* Search input */}
				<div className="p-3 space-y-3">
					<button
						className="w-full h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm text-zinc-300"
						type="button"
					>
						New Request
					</button>

					<div className="relative">
						<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
						<input
							type="text"
							placeholder="Find"
							className="w-full h-8 pl-8 pr-8 rounded-md bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
						/>
						<kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded">
							/
						</kbd>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto">
					<nav>
						{isLoading && <div className="text-zinc-500 text-sm px-4">Loading tables...</div>}
						{error && <div className="text-red-500 text-sm px-4">Failed to load tables</div>}
						{tables && tables.length === 0 && <div className="text-zinc-500 text-sm px-4">No tables found</div>}
						{tables && tables.length > 0 && (
							<ul>
								{tables.map((table) => (
									<TablesList
										key={table}
										item={{ id: table, label: table }}
										selectedIds={selectedTableIds}
										onSelect={handleSelect}
									/>
								))}
							</ul>
						)}
					</nav>
				</div>
			</div>
		</aside>
	);
};
