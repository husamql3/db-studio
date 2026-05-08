import type { FormatType } from "@db-studio/shared/types";
import { useMutation } from "@tanstack/react-query";
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

			const contentDispositionHeader = response.headers["content-disposition"];
			const contentDisposition =
				typeof contentDispositionHeader === "string" ? contentDispositionHeader : undefined;
			const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
			const filename = filenameMatch?.[1] || `${tableName}_export.${format}`;
			const contentTypeHeader = response.headers["content-type"];
			const contentType =
				typeof contentTypeHeader === "string" ? contentTypeHeader : "application/octet-stream";

			const blob = new Blob([response.data], {
				type: contentType,
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
