import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { cn } from "@db-studio/ui/utils";
import { Link } from "@tanstack/react-router";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { ArrowUpRight, Diamond, KeyRound, Link2, Table2 } from "lucide-react";
import type { GraphTable } from "@/features/visualizer/lib/schema-graph";

export const HEADER_HEIGHT = 36;
export const ROW_HEIGHT = 28;

export type VisualizerTableNode = Node<
	{
		table: GraphTable;
		active: boolean;
		dimmed: boolean;
		/** `<table id>.<column>` of every column on a highlighted edge. */
		highlightedColumns: Set<string>;
	},
	"table"
>;

export const ColumnIcon = ({ column }: { column: ColumnInfoSchemaType }) => (
	<span className="flex w-8 shrink-0 items-center gap-1">
		{column.isPrimaryKey ? (
			<KeyRound
				aria-label="Primary key"
				className="size-3.5 text-amber-500"
			/>
		) : column.isForeignKey ? (
			<Link2
				aria-label="Foreign key"
				className="size-3.5 text-sky-500"
			/>
		) : (
			<span className="size-3.5" />
		)}
		<Diamond
			aria-label={column.isNullable ? "Nullable" : "Required"}
			className={cn("size-3 text-muted-foreground", !column.isNullable && "fill-current")}
		/>
	</span>
);

// Edges attach to rows, not to the node, so the handles stay invisible and unconnectable.
const rowHandle = "size-1! min-h-0! min-w-0! border-0! bg-transparent!";

export const VisualizerTableNodeView = ({ data }: NodeProps<VisualizerTableNode>) => {
	const { table, active, dimmed, highlightedColumns } = data;

	return (
		<div
			data-active={active || undefined}
			data-dimmed={dimmed || undefined}
			className={cn(
				"group overflow-hidden rounded-md border bg-card text-card-foreground shadow-sm transition-opacity",
				active && "border-primary ring-2 ring-primary/30",
				dimmed && "opacity-25",
			)}
		>
			<div
				className="flex items-center gap-2 border-b bg-muted/60 px-3 text-sm font-medium"
				style={{ height: HEADER_HEIGHT }}
			>
				<Table2 className="size-4 shrink-0 text-muted-foreground" />
				<span className="flex-1 truncate">
					{table.schemaName && table.schemaName !== "public" && (
						<span className="text-muted-foreground">{table.schemaName}.</span>
					)}
					{table.tableName}
				</span>
				<Link
					to="/table/$table"
					params={{ table: table.tableName }}
					aria-label={`Open ${table.tableName}`}
					title="Open table"
					className="nodrag rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
					onClick={(e) => e.stopPropagation()}
				>
					<ArrowUpRight className="size-4" />
				</Link>
			</div>
			{table.columns.map((column) => (
				<div
					key={column.columnName}
					className={cn(
						"relative flex items-center gap-2 px-3 text-xs",
						highlightedColumns.has(`${table.id}.${column.columnName}`) && "bg-primary/10",
					)}
					style={{ height: ROW_HEIGHT }}
				>
					<Handle
						type="target"
						position={Position.Left}
						id={`${column.columnName}-l`}
						isConnectable={false}
						className={rowHandle}
					/>
					<ColumnIcon column={column} />
					<span className="truncate font-mono">{column.columnName}</span>
					<span className="ml-auto shrink-0 font-mono text-muted-foreground">
						{column.dataTypeLabel}
					</span>
					<Handle
						type="source"
						position={Position.Right}
						id={`${column.columnName}-r`}
						isConnectable={false}
						className={rowHandle}
					/>
				</div>
			))}
		</div>
	);
};
