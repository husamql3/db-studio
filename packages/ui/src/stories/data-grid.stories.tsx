import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "../data-display/data-grid/data-grid";
import { Badge } from "../primitives/badge";

export default {
	title: "UI/DataGrid",
};

type QueryRow = {
	id: number;
	table: string;
	status: "synced" | "stale";
	rows: number;
};

const columns: ColumnDef<QueryRow>[] = [
	{
		accessorKey: "id",
		header: "ID",
		size: 80,
	},
	{
		accessorKey: "table",
		header: "Table",
		size: 220,
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ getValue }) => <Badge variant="secondary">{getValue<string>()}</Badge>,
		size: 140,
	},
	{
		accessorKey: "rows",
		header: "Rows",
		cell: ({ getValue }) => getValue<number>().toLocaleString(),
		size: 160,
	},
];

const rows: QueryRow[] = [
	{ id: 1, table: "customers", status: "synced", rows: 2142 },
	{ id: 2, table: "orders", status: "synced", rows: 18903 },
	{ id: 3, table: "audit_log", status: "stale", rows: 98172 },
	{ id: 4, table: "daily_revenue", status: "synced", rows: 365 },
];

export const VirtualizedGrid = () => (
	<div className="h-64 w-[720px] rounded-xl border bg-background text-foreground">
		<DataGrid
			columns={columns}
			data={rows}
		/>
	</div>
);
