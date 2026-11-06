import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { Badge } from "@db-studio/ui/badge";
import { DataGrid } from "@db-studio/ui/data-grid";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import type { ColumnDef } from "@tanstack/react-table";
import { Link as LinkIcon } from "lucide-react";
import { useMemo } from "react";
import { CopyButton } from "@/components/copy-button";
import { TableSubScreen } from "@/components/table-sub-screen";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { useTableCols } from "@/hooks/use-table-cols";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { useOverlayStore } from "@/stores/overlay.store";
import { formatCellValue } from "@/utils/format-cell-value";
import { AddColumnForm } from "../components/add-column-form";
import { EditColumnForm } from "../components/edit-column-form";
import { SchemaRowActions } from "../components/schema-row-actions";
import { TypeBadge } from "../components/type-badge";

export const SchemaScreen = ({ tableName }: { tableName: string }) => {
	const {
		tableCols,
		isLoadingTableCols,
		isRefetchingTableCols,
		errorTableCols,
		refetchTableCols,
	} = useTableCols({ tableName, schemaName: useTableSchemaName() });

	const { openOverlay } = useOverlayStore();
	const canMutateSchema = useDatabaseEngine()?.schemaMutation !== false;

	const columns = useMemo<ColumnDef<ColumnInfoSchemaType>[]>(
		() => [
			{
				id: "index",
				header: "",
				cell: ({ row }) => (
					<span className="text-xs text-muted-foreground/60">{row.index + 1}</span>
				),
				size: 47,
				minSize: 47,
				enableResizing: false,
			},
			{
				id: "columnName",
				header: "Name",
				accessorKey: "columnName",
				cell: ({ getValue }) => (
					<span className="font-mono text-foreground font-medium truncate">
						{getValue<string>()}
					</span>
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
						<span className="font-mono text-xs text-muted-foreground truncate">{val}</span>
					) : (
						<span className="text-muted-foreground/50">—</span>
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
						<span className="text-xs text-muted-foreground">yes</span>
					) : (
						<span className="text-xs text-muted-foreground/50">no</span>
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
						return <span className="text-muted-foreground/50">—</span>;
					}

					return (
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-default">
									<LinkIcon className="size-3 text-muted-foreground/70" />
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
				size: 160,
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

	return (
		<TableSubScreen
			tableName={tableName}
			subject="schema"
			isLoading={isLoadingTableCols}
			error={errorTableCols}
			refetch={refetchTableCols}
			isRefetching={isRefetchingTableCols}
			action={
				canMutateSchema
					? { label: "Add Column", onClick: () => openOverlay("schema.add-column") }
					: undefined
			}
		>
			<DataGrid
				columns={columns}
				data={tableCols ?? []}
				renderCellAccessory={(value) => <CopyButton value={formatCellValue(value)} />}
			/>
			<AddColumnForm tableName={tableName} />
			<EditColumnForm tableName={tableName} />
		</TableSubScreen>
	);
};
