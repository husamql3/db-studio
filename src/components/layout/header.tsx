import { X } from "lucide-react";
import { useSearchParams } from "../../hooks/use-search-params";
import { cn } from "../../utils/cn";
import { CONSTANTS } from "../../utils/constants";
import { deleteSearchParam, setSearchParam } from "../../utils/search-params";

export const Header = ({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (isOpen: boolean) => void }) => {
	const { tables, activeTable } = useSearchParams();

	const handleTabClick = (table: string) => {
		setSearchParam(CONSTANTS.ACTIVE_TABLE, table);
	};

	const handleCloseTab = (table: string, e: React.MouseEvent) => {
		e.stopPropagation();

		const remainingTables = tables.filter((t) => t !== table);

		if (remainingTables.length > 0) {
			setSearchParam(CONSTANTS.TABLES, remainingTables.join(","));

			// If closing the active tab, set the first remaining as active
			if (activeTable === table) {
				setSearchParam(CONSTANTS.ACTIVE_TABLE, remainingTables[remainingTables.length - 1]);
			}
		} else {
			// No tables left, remove both params
			deleteSearchParam(CONSTANTS.TABLES);
			deleteSearchParam(CONSTANTS.ACTIVE_TABLE);
		}
	};

	return (
		<header className="h-8 border-l border-b border-zinc-800 w-full flex items-center bg-black">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="aspect-square size-8 border-r border-zinc-800 flex items-center justify-center text-sm font-medium hover:bg-zinc-900 transition-colors text-zinc-400"
			>
				<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
					<path
						d="M3 8.25V18C3 18.5967 3.23705 19.169 3.65901 19.591C4.08097 20.0129 4.65326 20.25 5.25 20.25H18.75C19.3467 20.25 19.919 20.0129 20.341 19.591C20.7629 19.169 21 18.5967 21 18V8.25M3 8.25V6C3 5.40326 3.23705 4.83097 3.65901 4.40901C4.08097 3.98705 4.65326 3.75 5.25 3.75H18.75C19.3467 3.75 19.919 3.98705 20.341 4.40901C20.7629 4.83097 21 5.40326 21 6V8.25M3 8.25H21M5.25 6H5.258V6.008H5.25V6ZM7.5 6H7.508V6.008H7.5V6ZM9.75 6H9.758V6.008H9.75V6Z"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
					<title>Open sidebar</title>
					<path
						className="icon-bar"
						d="M4.75 10H11V18.5H5.75C5.19772 18.5 4.75 18.0523 4.75 17.5V10Z"
						fill="currentColor"
					/>
				</svg>
			</button>

			<ul className="flex items-center h-full">
				{tables.map((table) => {
					const isActive = activeTable === table;
					return (
						<li key={table} className="h-full">
							<button
								type="button"
								onClick={() => handleTabClick(table)}
								className={cn(
									"h-full px-2 flex items-center gap-1 text-sm border-r border-zinc-800",
									"transition-colors group relative",
									isActive ? "bg-zinc-900 text-zinc-100" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50",
								)}
							>
								<span>{table}</span>
								<button
									type="button"
									onClick={(e) => handleCloseTab(table, e)}
									className="pacity-100 hover:bg-zinc-800 rounded p-0.5 transition-opacity"
									title="Close tab"
								>
									<X className="size-3" />
								</button>
								{isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
							</button>
						</li>
					);
				})}
			</ul>
		</header>
	);
};
