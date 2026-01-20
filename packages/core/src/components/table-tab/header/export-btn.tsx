import { Download } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTableCols } from "@/hooks/use-table-cols";
import { useTableData } from "@/hooks/use-table-data";
import { toast } from "sonner";

export const ExportBtn = ({ tableName }: { tableName: string }) => {
	const { tableData, isLoadingTableData } = useTableData({
		tableName,
	});
	const { tableCols, isLoadingTableCols } = useTableCols({
		tableName,
	});

	const exportToCSV = useCallback(() => {
		if (!tableData?.data || !tableCols) {
			toast.error("No data available to export");
			return;
		}

		try {
			const data = tableData.data;
			const columns = tableCols.map((col: { columnName: string }) => col.columnName);

			// Create CSV header
			const csvHeader = columns.join(",");

			// Create CSV rows
			const csvRows = data.map((row: Record<string, unknown>) => {
				return columns
					.map((col: string) => {
						const value = row[col];
						// Handle null/undefined
						if (value === null || value === undefined) return "";
						// Escape quotes and wrap in quotes if contains comma, newline, or quote
						const stringValue = String(value);
						if (
							stringValue.includes(",") ||
							stringValue.includes("\n") ||
							stringValue.includes('"')
						) {
							return `"${stringValue.replace(/"/g, '""')}"`;
						}
						return stringValue;
					})
					.join(",");
			});

			// Combine header and rows
			const csv = [csvHeader, ...csvRows].join("\n");

			// Create blob and download
			const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
			const link = document.createElement("a");
			const url = URL.createObjectURL(blob);
			link.setAttribute("href", url);
			link.setAttribute("download", `${tableName}_export.csv`);
			link.style.visibility = "hidden";
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);

			toast.success(`Exported ${data.length} rows to CSV`);
		} catch (error) {
			console.error("Export to CSV failed:", error);
			toast.error("Failed to export to CSV");
		}
	}, [tableData, tableCols, tableName]);

	const exportToExcel = useCallback(async () => {
		if (!tableData?.data || !tableCols) {
			toast.error("No data available to export");
			return;
		}

		try {
			// Dynamic import of xlsx to reduce bundle size
			const XLSX = await import("xlsx");

			const data = tableData.data;
			const columns = tableCols.map((col: { columnName: string }) => col.columnName);

			// Convert data to worksheet format
			const worksheetData = [
				columns, // Header row
				...data.map((row: Record<string, unknown>) => columns.map((col: string) => row[col] ?? "")),
			];

			const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, tableName);

			// Generate and download file
			XLSX.writeFile(workbook, `${tableName}_export.xlsx`);

			toast.success(`Exported ${data.length} rows to Excel`);
		} catch (error) {
			console.error("Export to Excel failed:", error);
			toast.error("Failed to export to Excel");
		}
	}, [tableData, tableCols, tableName]);

	const isDisabled = isLoadingTableData || isLoadingTableCols || !tableData?.data;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className="size-8! aspect-square border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
					aria-label="Export table data"
					disabled={isDisabled}
				>
					<Download className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-40">
				<DropdownMenuItem onClick={exportToCSV}>
					Export to CSV
				</DropdownMenuItem>
				<DropdownMenuItem onClick={exportToExcel}>
					Export to Excel
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
