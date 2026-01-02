import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useQueryState } from "nuqs";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { CONSTANTS } from "@/utils/constants";

export const SidebarQueriesSearch = () => {
	const inputRef = useRef<HTMLInputElement>(null);
	const [searchTerm, setSearchTerm] = useQueryState(CONSTANTS.SIDEBAR_TABLE_SEARCH);

	return (
		<div className="p-3 space-y-2">
			<Button
				className="w-full justify-start h-8"
				// onClick={() => openSheet("add-table")}
			>
				<IconPlus className="size-4" />
				Add Query
			</Button>

			<div className="relative">
				<IconSearch className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<Input
					ref={inputRef}
					placeholder="Search queries"
					value={searchTerm ?? ""}
					onChange={(e) => setSearchTerm(e.target.value)}
					className="rounded-sm h-8 pl-8 pr-8"
				/>
				<Kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-xs">/</Kbd>
			</div>
		</div>
	);
};
