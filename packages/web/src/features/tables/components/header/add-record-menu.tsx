import { Button } from "@db-studio/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@db-studio/ui/dropdown-menu";
import { Plus } from "lucide-react";
import { useOverlayStore } from "@/stores/overlay.store";

export const AddRecordMenu = () => {
	const { openOverlay } = useOverlayStore();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="default"
					className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none flex items-center gap-2"
					aria-label="Add records to the table"
				>
					<Plus className="size-4" />
					Add Record
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-48"
			>
				<DropdownMenuItem onClick={() => openOverlay("records.add-record")}>
					Add Record
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openOverlay("records.bulk-insert-csv")}>
					Add data from CSV
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openOverlay("records.bulk-insert-excel")}>
					Add data from Excel
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openOverlay("records.bulk-insert-json")}>
					Add data from JSON
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
