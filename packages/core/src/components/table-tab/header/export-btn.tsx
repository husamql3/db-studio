import { Download } from "lucide-react";
import { useCallback, useState } from "react";
import type { FormatType } from "shared/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";

export const ExportBtn = ({ tableName }: { tableName: string }) => {
	const [isExporting, setIsExporting] = useState(false);
	const { selectedDatabase } = useDatabaseStore();

	const handleExport = useCallback(
		async (format: FormatType) => {
			setIsExporting(true);
			try {
				const response = await api.get(`/tables/${tableName}/export`, {
					params: {
						db: selectedDatabase ?? "",
						format,
					},
					responseType: "blob",
				});

				const contentDisposition = response.headers["content-disposition"];
				const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
				const filename = filenameMatch?.[1] || `${tableName}_export.${format}`;

				const blob = new Blob([response.data], {
					type: response.headers["content-type"],
				});
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
		[tableName, selectedDatabase],
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
				<DropdownMenuItem onClick={() => handleExport("csv")}>Export to CSV</DropdownMenuItem>
				<DropdownMenuItem onClick={() => handleExport("xlsx")}>
					Export to Excel
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
