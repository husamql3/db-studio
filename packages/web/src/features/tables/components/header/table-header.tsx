import type { OnChangeFn, Row, RowSelectionState } from "@tanstack/react-table";
// import { SettingsBtn } from "./settings-menu";
import { useIsSchemaless } from "@/hooks/use-is-schemaless";
import type { TableRecord } from "@/types/table.type";
import { AddRecordMenu } from "./add-record-menu";
import { ClearBtn } from "./clear-btn";
import { DeleteBtn } from "./delete-btn";
import { FilterPopup } from "./filter-popup";
import { RefetchBtn } from "./refetch-btn";
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

	return (
		<header className="max-h-8 overflow-hidden border-b border-zinc-800 w-full flex items-center justify-between bg-zinc-950 sticky top-0 left-0 right-0 z-0">
			<div className="flex items-center ">
				<RefetchBtn tableName={tableName} />
				{!isSchemaless && <FilterPopup tableName={tableName} />}
				<AddRecordMenu />
				<SaveBtn setRowSelection={setRowSelection} />
				<ClearBtn />
				<DeleteBtn
					tableName={tableName}
					selectedRows={selectedRows}
					setRowSelection={setRowSelection}
				/>
			</div>

			{/* <div className="flex items-center">
				<SettingsBtn />
			</div> */}
		</header>
	);
};
