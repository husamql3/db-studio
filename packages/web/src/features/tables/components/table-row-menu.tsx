import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@db-studio/ui/context-menu";
import type { Table } from "@tanstack/react-table";
import { Braces, CopyPlus, FileCode } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { useAddRecordStore } from "@/features/records";
import { useTableCols } from "@/features/schema";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { useOverlayStore } from "@/stores/overlay.store";
import type { TableRecord } from "@/types/table.type";
import { toDuplicateValues, toInsertStatement } from "../utils/row-actions";
import { copyTextToClipboard } from "../utils/row-details-utils";

const copy = (text: string, success: string) =>
	toast.promise(copyTextToClipboard(text), {
		success,
		error: "Could not write to the clipboard",
	});

/** Right-click actions for the row under the pointer; `row` is undefined until one is chosen. */
export const TableRowMenu = ({
	table,
	tableName,
	row,
	onOpenChange,
	children,
}: {
	table: Table<TableRecord>;
	tableName: string;
	row: TableRecord | undefined;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}) => {
	const schemaName = useTableSchemaName();
	const { tableCols } = useTableCols({ tableName, schemaName });
	const dialect = useDatabaseEngine()?.sqlInsert;
	const { openOverlay } = useOverlayStore();

	return (
		<ContextMenu onOpenChange={onOpenChange}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			{row ? (
				<ContextMenuContent>
					<ContextMenuItem
						onClick={() => copy(JSON.stringify(row, null, 2), "Row copied as JSON")}
					>
						<Braces className="size-4" />
						Copy row as JSON
					</ContextMenuItem>
					{dialect ? (
						<ContextMenuItem
							onClick={() =>
								copy(
									toInsertStatement({ tableName, schemaName, row, dialect }),
									"Row copied as SQL INSERT",
								)
							}
						>
							<FileCode className="size-4" />
							Copy as SQL INSERT
						</ContextMenuItem>
					) : null}
					<ContextMenuItem
						disabled={!table.options.meta?.canMutateRows || !tableCols}
						onClick={() => {
							if (!tableCols) return;
							useAddRecordStore.getState().setPrefill(toDuplicateValues(row, tableCols));
							openOverlay("records.add-record");
						}}
					>
						<CopyPlus className="size-4" />
						Duplicate row
					</ContextMenuItem>
				</ContextMenuContent>
			) : null}
		</ContextMenu>
	);
};
