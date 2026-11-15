import { statSync } from "node:fs";

export const formatFileSize = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;

	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** The size of a database file; an empty path is an in-memory database. */
export const fileSize = (filePath: string): string => {
	if (!filePath) return "in-memory";

	try {
		return formatFileSize(statSync(filePath).size);
	} catch {
		return "N/A";
	}
};
