import { useMutation } from "@tanstack/react-query";
import type { FormatType } from "shared/types";
import { toast } from "sonner";
import { exportTable } from "@/shared/api";
import { useDatabaseStore } from "@/stores/database.store";

type ExportFileParams = {
	tableName: string;
	format: FormatType;
};

export const useExportFile = () => {
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: exportFileMutation, isPending: isExportingFile } = useMutation({
		mutationFn: async ({ tableName, format }: ExportFileParams) => {
			const response = await exportTable({ tableName, format, db: selectedDatabase });

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
		},
	});

	const exportFile = async ({ tableName, format }: ExportFileParams) => {
		return toast.promise(exportFileMutation({ tableName, format }), {
			loading: "Exporting file...",
			success: "File exported successfully",
			error: (error: Error) => error.message || "Failed to export file",
		});
	};

	return {
		exportFile,
		isExportingFile,
	};
};
