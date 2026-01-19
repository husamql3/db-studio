import { Plus, Search } from "lucide-react";
import { useQueryState } from "nuqs";
import { useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { useSheetStore } from "@/stores/sheet.store";
import { CONSTANTS } from "@/utils/constants";

export const SidebarSearchTables = () => {
	const inputRef = useRef<HTMLInputElement>(null);
	const [searchTerm, setSearchTerm] = useQueryState(CONSTANTS.SIDEBAR_SEARCH, {
		defaultValue: "",
	});
	const { openSheet } = useSheetStore();

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
		<div className="p-3 space-y-2">
			<Button
				className="w-full justify-start h-8"
				onClick={() => openSheet("add-table")}
			>
				<Plus className="size-4" />
				Add Table
			</Button>

			<div className="relative">
				<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<Input
					ref={inputRef}
					placeholder="Search tables"
					value={searchTerm ?? ""}
					onChange={(e) => setSearchTerm(e.target.value.trim())}
					className="rounded-sm h-8 pl-8 pr-8"
				/>
				<Kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-xs">
					/
				</Kbd>
			</div>
		</div>
	);
};
