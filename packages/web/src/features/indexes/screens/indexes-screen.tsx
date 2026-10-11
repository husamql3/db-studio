import type { INDEX_KINDS, IndexInfoSchemaType } from "@db-studio/shared/types";
import { Badge } from "@db-studio/ui/badge";
import { Button } from "@db-studio/ui/button";
import { DataGrid } from "@db-studio/ui/data-grid";
import { Spinner } from "@db-studio/ui/spinner";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import { CellCopyButton } from "@/features/tables";
import { useOverlayStore } from "@/stores/overlay.store";
import { CreateIndexForm } from "../components/create-index-form";
import { DropIndexDialog } from "../components/drop-index-dialog";
import { IndexRowActions } from "../components/index-row-actions";
import { IndexesToolbar } from "../components/indexes-toolbar";
import { useTableIndexes } from "../hooks/use-table-indexes";

const KIND_LABEL: Record<(typeof INDEX_KINDS)[number], string | null> = {
	primary: "Primary",
	"unique-constraint": "Unique constraint",
	index: null,
};

export const IndexesScreen = ({ tableName }: { tableName: string }) => {
	const {
		tableIndexes,
		isLoadingTableIndexes,
		isRefetchingTableIndexes,
		errorTableIndexes,
		refetchTableIndexes,
	} = useTableIndexes({ tableName });
	const { openOverlay } = useOverlayStore();
	const hasMethods = Boolean(tableIndexes?.some((index) => index.method !== null));

	const columns = useMemo<ColumnDef<IndexInfoSchemaType>[]>(
		() => [
			{
				id: "indexName",
				header: "Name",
				accessorKey: "indexName",
				cell: ({ row }) => {
					const kindLabel = KIND_LABEL[row.original.kind];
					return (
						<div className="flex items-center gap-2 min-w-0">
							<span className="font-mono text-foreground font-medium truncate">
								{row.original.indexName}
							</span>
							{kindLabel && (
								<Badge
									variant="secondary"
									className="text-[0.6rem] px-1.5 shrink-0"
								>
									{kindLabel}
								</Badge>
							)}
						</div>
					);
				},
				size: 340,
				minSize: 160,
			},
			{
				id: "columns",
				header: "Columns",
				accessorFn: (index) => index.columns.join(", "),
				cell: ({ getValue }) => (
					<span className="font-mono text-xs text-muted-foreground truncate">
						{getValue<string>()}
					</span>
				),
				size: 220,
				minSize: 120,
			},
			{
				id: "isUnique",
				header: "Unique",
				cell: ({ row }) =>
					row.original.isUnique ? (
						<span className="text-xs text-muted-foreground">yes</span>
					) : (
						<span className="text-xs text-muted-foreground/50">no</span>
					),
				size: 90,
				minSize: 80,
			},
			...(hasMethods
				? [
						{
							id: "method",
							header: "Method",
							cell: ({ row }) => (
								<span className="font-mono text-xs text-muted-foreground">
									{row.original.method}
								</span>
							),
							size: 100,
							minSize: 80,
						} satisfies ColumnDef<IndexInfoSchemaType>,
					]
				: []),
			{
				id: "definition",
				header: "Definition",
				accessorKey: "definition",
				cell: ({ getValue }) => {
					const definition = getValue<string | null>();
					return definition ? (
						<span className="font-mono text-xs text-muted-foreground truncate">
							{definition}
						</span>
					) : (
						<span className="text-muted-foreground/50">—</span>
					);
				},
				size: 360,
				minSize: 120,
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<div className="flex flex-1 justify-center items-center">
						<IndexRowActions index={row.original} />
					</div>
				),
				size: 50,
				enableResizing: false,
			},
		],
		[hasMethods],
	);

	if (isLoadingTableIndexes) {
		return (
			<div className="size-full flex items-center justify-center">
				<Spinner size="size-7" />
			</div>
		);
	}

	if (errorTableIndexes) {
		return (
			<div className="size-full flex flex-col items-center justify-center gap-2">
				<div className="text-sm font-medium">Failed to load indexes</div>
				<div className="text-sm text-muted-foreground">{errorTableIndexes.message}</div>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col overflow-hidden">
			<IndexesToolbar
				tableName={tableName}
				refetch={refetchTableIndexes}
				isRefetching={isRefetchingTableIndexes}
			/>
			{tableIndexes?.length ? (
				<DataGrid
					columns={columns}
					data={tableIndexes}
					renderCellAccessory={(value) => <CellCopyButton value={value} />}
				/>
			) : (
				<div className="flex-1 flex flex-col items-center justify-center gap-3">
					<div className="text-sm text-muted-foreground">This table has no indexes yet.</div>
					<Button
						type="button"
						onClick={() => openOverlay("indexes.create-index")}
					>
						<Plus className="size-4" />
						Create index
					</Button>
				</div>
			)}
			<CreateIndexForm tableName={tableName} />
			<DropIndexDialog tableName={tableName} />
		</div>
	);
};
