import { Download } from "lucide-react";
import { useQueryState } from "nuqs";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULTS } from "shared/constants";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

export const ExportBtn = ({ tableName }: { tableName: string }) => {
	const [isExporting, setIsExporting] = useState(false);
	const { selectedDatabase } = useDatabaseStore();

	// Get current sort, order, and filters from URL state
	const [sort] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.SORT);
	const [order] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.ORDER);
	const [filters] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.FILTERS);

	const handleExport = useCallback(
		async (format: "csv" | "excel") => {
			setIsExporting(true);
			try {
				// Build query params
				const params = new URLSearchParams();
				params.append("format", format);
				if (selectedDatabase) params.append("database", selectedDatabase);
				if (sort) params.append("sort", sort);
				if (order) params.append("order", order);
				if (filters) params.append("filters", filters);

				// Make request to backend export endpoint
				const response = await fetch(
					new URL(
						`/tables/${tableName}/export?${params.toString()}`,
						DEFAULTS.BASE_URL,
					),
				);

				if (!response.ok) {
					throw new Error("Export failed");
				}

				// Get filename from Content-Disposition header or use default
				const contentDisposition = response.headers.get("Content-Disposition");
				const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
				const filename =
					filenameMatch?.[1] ||
					`${tableName}_export.${format === "csv" ? "csv" : "xlsx"}`;

				// Create blob and download
				const blob = await response.blob();
				const url = window.URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = url;
				link.download = filename;
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				window.URL.revokeObjectURL(url);

				toast.success(`Table exported successfully as ${format.toUpperCase()}`);
			} catch (error) {
				console.error("Export failed:", error);
				toast.error("Failed to export table");
			} finally {
				setIsExporting(false);
			}
		},
		[tableName, selectedDatabase, sort, order, filters],
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className="size-8! aspect-square border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
					aria-label="Export table data"
					disabled={isExporting}
				>
					<Download className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-40"
			>
				<DropdownMenuItem onClick={() => handleExport("csv")}>
					Export to CSV
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => handleExport("excel")}>
					Export to Excel
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
