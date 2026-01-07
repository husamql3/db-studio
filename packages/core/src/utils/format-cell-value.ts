export const formatCellValue = (value: unknown): string => {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	return String(value);
};
