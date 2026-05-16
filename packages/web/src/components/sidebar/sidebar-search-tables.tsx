import { Button } from "@db-studio/ui/button";
import { Input } from "@db-studio/ui/input";
import { Kbd } from "@db-studio/ui/kbd";
import { Plus, Search } from "lucide-react";
import { useQueryState } from "nuqs";
import { useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";
import { CONSTANTS } from "@/utils/constants";

export const SidebarSearchTables = () => {
	const inputRef = useRef<HTMLInputElement>(null);
	const [searchTerm, setSearchTerm] = useQueryState(CONSTANTS.SIDEBAR_SEARCH, {
		defaultValue: "",
	});
	const { openOverlay } = useOverlayStore();
	const { dbType } = useDatabaseStore();

	// todo: fix this shit
	useHotkeys(
		"/",
		(event) => {
			event.preventDefault();
			if (inputRef.current) {
				inputRef.current.focus();
			}
		},
		{
			preventDefault: true,
		},
	);

	return (
		<div className="px-3 pb-3 pt-2 space-y-2">
			{/* {dbType !== "mongodb" && dbType !== "redis" && ( */}
			{dbType !== "mongodb" && (
				<Button
					className="w-full justify-start h-8"
					onClick={() => openOverlay("table-builder.create-table")}
				>
					<Plus className="size-4" />
					Add Table
				</Button>
			)}

			<div className="relative">
				<Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
				<Input
					ref={inputRef}
					placeholder="Search tables"
					value={searchTerm ?? ""}
					onChange={(e) => setSearchTerm(e.target.value.trim())}
					className="rounded-sm h-8 pl-8 pr-8"
				/>
				<Kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-xs">/</Kbd>
			</div>
		</div>
	);
};
