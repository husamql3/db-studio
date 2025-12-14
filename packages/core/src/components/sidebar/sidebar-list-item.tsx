import { useQueryState } from "nuqs";
import { cn } from "@/lib/utils";
import { CONSTANTS } from "@/utils/constants";
import { Kbd } from "../ui/kbd";

// todo: add supabase menu
// todo: copy name & scheme, edit table, export data, delete table

export const SidebarListItem = ({
	tableName,
	rowCount,
}: {
	tableName: string;
	rowCount: number;
}) => {
	const [activeTable, setActiveTable] = useQueryState(CONSTANTS.ACTIVE_TABLE, {
		shallow: true,
	});

	return (
		<li className="relative">
			<button
				type="button"
				onClick={() => setActiveTable(tableName)}
				className={cn(
					"w-full flex gap-2 px-4 py-1.5 text-sm transition-colors text-left",
					"hover:text-zinc-100 focus:outline-none focus:bg-blue-500/10 focus:text-zinc-100 justify-start items-center",
					activeTable === tableName ? "text-white bg-zinc-800/50" : "text-zinc-400",
				)}
			>
				{activeTable === tableName && (
					<span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
				)}
				<span className="flex-1">{tableName}</span>
				<Kbd>{rowCount}</Kbd>
				{/* <span className="text-xs font-medium text-zinc-200 bg-zinc-700/60 px-1.5 py-0.5 rounded">
          {rowCount}
        </span> */}
			</button>
		</li>
	);
};
