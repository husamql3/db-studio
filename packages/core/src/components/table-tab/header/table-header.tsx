import type { OnChangeFn, Row, RowSelectionState } from "@tanstack/react-table";
import { AddRecordBtn } from "@/components/table-tab/header/add-record-btn";
import { ClearBtn } from "@/components/table-tab/header/clear-btn";
import { DeleteBtn } from "@/components/table-tab/header/delete-btn";
import { FilterPopup } from "@/components/table-tab/header/filter-popup";
import { RefetchBtn } from "@/components/table-tab/header/refetch-btn";
import { SaveBtn } from "@/components/table-tab/header/save-btn";
import { SettingsBtn } from "@/components/table-tab/header/settings-menu";
import type { TableRecord } from "@/types/table.type";

export const TableHeader = ({
	selectedRows,
	setRowSelection,
}: {
	selectedRows: Row<TableRecord>[];
	setRowSelection: OnChangeFn<RowSelectionState>;
}) => {
	return (
		<header className="max-h-8 overflow-hidden border-b border-zinc-800 w-full flex items-center justify-between bg-black sticky top-0 left-0 right-0 z-0">
			<div className="flex items-center ">
				<RefetchBtn />
				<FilterPopup />
				<AddRecordBtn />
				<SaveBtn setRowSelection={setRowSelection} />
				<ClearBtn />
				<DeleteBtn
					selectedRows={selectedRows}
					setRowSelection={setRowSelection}
				/>
			</div>

			<div className="flex items-center">
				<SettingsBtn />
			</div>
		</header>
	);
};
