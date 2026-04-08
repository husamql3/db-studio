import type { ColumnDef } from "@tanstack/react-table";
import { Link as LinkIcon } from "lucide-react";
import { useMemo } from "react";
import type { ColumnInfoSchemaType } from "shared/types";
import { DataGrid } from "@/components/data-grid/data-grid";
import { AddColumnForm } from "@/components/schema-tab/add-column-form";
import { EditColumnForm } from "@/components/schema-tab/edit-column-form";
import { SchemaRowActions } from "@/components/schema-tab/schema-row-actions";
import { SchemaToolbar } from "@/components/schema-tab/schema-toolbar";
import { TypeBadge } from "@/components/schema-tab/type-badge";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTableCols } from "@/hooks/use-table-cols";

export const SchemaTab = ({ tableName }: { tableName: string }) => {
	const {
		tableCols,
		isLoadingTableCols,
		isRefetchingTableCols,
		errorTableCols,
		refetchTableCols,
	} = useTableCols({ tableName });

	const columns = useMemo<ColumnDef<ColumnInfoSchemaType>[]>(
		() => [
			{
				id: "index",
				header: "",
				cell: ({ row }) => <span className="text-xs text-zinc-600">{row.index + 1}</span>,
				size: 47,
				minSize: 47,
				enableResizing: false,
			},
			{
				id: "columnName",
				header: "Name",
				accessorKey: "columnName",
				cell: ({ getValue }) => (
					<span className="font-mono text-zinc-100 truncate">{getValue<string>()}</span>
				),
				minSize: 100,
				size: 200,
			},
			{
				id: "dataTypeLabel",
				header: "Type",
				cell: ({ row }) => <TypeBadge col={row.original} />,
				size: 100,
				minSize: 100,
			},
			{
				id: "columnDefault",
				header: "Default",
				accessorKey: "columnDefault",
				cell: ({ getValue }) => {
					const val = getValue<string | null>();
					return val ? (
						<span className="font-mono text-xs text-zinc-400 truncate">{val}</span>
					) : (
						<span className="text-zinc-600">—</span>
					);
				},
				minSize: 100,
				size: 180,
			},
			{
				id: "isNullable",
				header: "Nullable",
				accessorKey: "isNullable",
				cell: ({ getValue }) =>
					getValue<boolean>() ? (
						<span className="text-xs text-zinc-400">yes</span>
					) : (
						<span className="text-xs text-zinc-600">no</span>
					),
				minSize: 100,
			},
			{
				id: "key",
				header: "Key",
				cell: ({ row }) => {
					const { isPrimaryKey, isForeignKey } = row.original;
					return (
						<div className="flex items-center gap-1">
							{isPrimaryKey && (
								<Badge
									variant="default"
									className="text-[0.6rem] px-1.5"
								>
									PK
								</Badge>
							)}
							{isForeignKey && (
								<Badge
									variant="secondary"
									className="text-[0.6rem] px-1.5"
								>
									FK
								</Badge>
							)}
						</div>
					);
				},
				minSize: 100,
				size: 90,
			},
			{
				id: "references",
				header: "References",
				cell: ({ row }) => {
					const { isForeignKey, referencedTable, referencedColumn } = row.original;
					if (!isForeignKey || !referencedTable || !referencedColumn) {
						return <span className="text-zinc-600">—</span>;
					}
					return (
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="inline-flex items-center gap-1 text-xs text-zinc-400 cursor-default">
									<LinkIcon className="size-3 text-zinc-600" />
									<span className="font-mono">
										{referencedTable}.{referencedColumn}
									</span>
								</span>
							</TooltipTrigger>
							<TooltipContent side="left">
								<p>
									References{" "}
									<span className="font-mono font-medium">
										{referencedTable}.{referencedColumn}
									</span>
								</p>
							</TooltipContent>
						</Tooltip>
					);
				},
				size: 220,
				minSize: 100,
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<div className="flex justify-center items-center">
						<SchemaRowActions
							col={row.original}
							tableName={tableName}
						/>
					</div>
				),
				size: 50,
				enableResizing: false,
			},
		],
		[tableName],
	);

	if (isLoadingTableCols) {
		return (
			<div className="size-full flex items-center justify-center">
				<Spinner size="size-7" />
			</div>
		);
	}

	if (errorTableCols) {
		return (
			<div className="size-full flex flex-col items-center justify-center gap-2">
				<div className="text-sm font-medium">Failed to load schema</div>
				<div className="text-sm text-muted-foreground">{errorTableCols.message}</div>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col overflow-hidden">
			<SchemaToolbar
				tableName={tableName}
				refetch={refetchTableCols}
				isRefetching={isRefetchingTableCols}
			/>
			<DataGrid
				columns={columns}
				data={tableCols ?? []}
			/>
			<AddColumnForm tableName={tableName} />
			<EditColumnForm tableName={tableName} />
		</div>
	);
};
