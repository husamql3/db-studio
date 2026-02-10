import type { OnChangeFn, Row, RowSelectionState } from "@tanstack/react-table";
import { AddRecordMenu } from "@/components/table-tab/header/add-record-menu";
import { ClearBtn } from "@/components/table-tab/header/clear-btn";
import { DeleteBtn } from "@/components/table-tab/header/delete-btn";
import { ExportBtn } from "@/components/table-tab/header/export-btn";
import { FilterPopup } from "@/components/table-tab/header/filter-popup";
import { RefetchBtn } from "@/components/table-tab/header/refetch-btn";
import { SaveBtn } from "@/components/table-tab/header/save-btn";
// import { SettingsBtn } from "@/components/table-tab/header/settings-menu";
import type { TableRecord } from "@/types/table.type";

export const TableHeader = ({
	selectedRows,
	setRowSelection,
	tableName,
}: {
	selectedRows: Row<TableRecord>[];
	setRowSelection: OnChangeFn<RowSelectionState>;
	tableName: string;
}) => {
	return (
		<header className="max-h-8 overflow-hidden border-b border-zinc-800 w-full flex items-center justify-between bg-black sticky top-0 left-0 right-0 z-0">
			<div className="flex items-center ">
				<RefetchBtn tableName={tableName} />
				<FilterPopup tableName={tableName} />
				<AddRecordMenu />
				<SaveBtn setRowSelection={setRowSelection} />
				<ClearBtn />
				<DeleteBtn
					tableName={tableName}
					selectedRows={selectedRows}
					setRowSelection={setRowSelection}
				/>
				<ExportBtn tableName={tableName} />
			</div>

			{/* <div className="flex items-center">
				<SettingsBtn />
			</div> */}
		</header>
	);
};
