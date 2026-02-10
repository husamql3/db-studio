import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useExportFile } from "@/hooks/use-export-file";

// todo: move to sidebar-list-tables-item.tsx

export const ExportBtn = ({ tableName }: { tableName: string }) => {
	const { exportFile, isExportingFile } = useExportFile();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className="size-8! aspect-square border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
					aria-label="Export table data"
					disabled={isExportingFile}
				>
					<Download className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-40"
			>
				<DropdownMenuItem
					onClick={() => exportFile({ tableName, format: "csv" })}
					disabled={isExportingFile}
				>
					Export to CSV
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => exportFile({ tableName, format: "xlsx" })}
					disabled={isExportingFile}
				>
					Export to Excel
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => exportFile({ tableName, format: "json" })}
					disabled={isExportingFile}
				>
					Export to JSON
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
