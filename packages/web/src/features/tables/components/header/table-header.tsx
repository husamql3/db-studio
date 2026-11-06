import type { OnChangeFn, Row, RowSelectionState } from "@tanstack/react-table";
import { useQueryState } from "nuqs";
import { FilterPopup } from "@/components/filter-popup";
import type { TableRecord } from "@/features/tables/table.type";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { useIsSchemaless } from "@/hooks/use-is-schemaless";
import { CONSTANTS } from "@/utils/constants";
import { tableFiltersParser } from "../../hooks/use-grid-page";
import { useRowMutation } from "../../hooks/use-row-mutation";
import { AddRecordMenu } from "./add-record-menu";
import { ClearBtn } from "./clear-btn";
import { ColumnPreferencesMenu } from "./column-preferences-menu";
import { DeleteBtn } from "./delete-btn";
import { LiveModeToggle } from "./live-mode-toggle";
import { RefetchBtn } from "./refetch-btn";
import { ReviewBtn } from "./review-btn";
import { SaveBtn } from "./save-btn";

export const TableHeader = ({
	selectedRows,
	setRowSelection,
	tableName,
}: {
	selectedRows: Row<TableRecord>[];
	setRowSelection: OnChangeFn<RowSelectionState>;
	tableName: string;
}) => {
	const isSchemaless = useIsSchemaless();
	const engine = useDatabaseEngine();
	const canLiveMode = engine?.liveMode ?? false;
	const { rowMutationReason } = useRowMutation();

	const [filters, setFilters] = useQueryState(
		CONSTANTS.TABLE_STATE_KEYS.FILTERS,
		tableFiltersParser,
	);

	const [, setCursor] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.CURSOR);
	const [, setDirection] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.DIRECTION);

	return (
		<header className="max-h-8 overflow-hidden border-b border-border w-full flex items-center justify-between bg-background sticky top-0 left-0 right-0 z-0">
			<div className="flex items-center ">
				<RefetchBtn tableName={tableName} />
				{canLiveMode && <LiveModeToggle />}
				{!isSchemaless && (
					<FilterPopup
						tableName={tableName}
						filters={filters}
						onApply={(next) => {
							setFilters(next);
							setCursor(null);
							setDirection(null);
						}}
					/>
				)}
				<ColumnPreferencesMenu tableName={tableName} />
				<AddRecordMenu />
				<SaveBtn
					setRowSelection={setRowSelection}
					disabledReason={rowMutationReason}
				/>
				<ReviewBtn />
				<ClearBtn />
				<DeleteBtn
					tableName={tableName}
					selectedRows={selectedRows}
					setRowSelection={setRowSelection}
					disabledReason={rowMutationReason}
				/>
			</div>
		</header>
	);
};
