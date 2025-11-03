import type { ColumnDef } from "@tanstack/react-table";
import type { TableRow } from "../services/get-table";

export const generateColumnsFromData = (data: TableRow[]): ColumnDef<TableRow>[] => {
	if (!data || data.length === 0) {
		return [];
	}

	const firstRow = data[0];
	const keys = Object.keys(firstRow);

	return keys.map((key) => ({
		accessorKey: key,
		header: key,
		cell: (info) => {
			const value = info.getValue();
			if (value instanceof Date) {
				return value.toLocaleString();
			}

			if (typeof value === "object" && value !== null) {
				return JSON.stringify(value);
			}

			return <span className="truncate block">{String(value ?? "")}</span>;
		},
	}));
};
