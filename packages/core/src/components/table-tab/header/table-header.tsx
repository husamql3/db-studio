import type { Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { AddRecordBtn } from "./add-record-btn";
import { ClearBtn } from "./clear-btn";
import { DeleteBtn } from "./delete-btn";
import { FilterPopup } from "./filter-popup";
import { RefetchBtn } from "./refetch-btn";
import { SaveBtn } from "./save-btn";
import { SettingsBtn } from "./settings-btn";

export const TableHeader = ({
	table,
	rowVirtualizer,
}: {
	table: Table<Record<string, unknown>>;
	rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
}) => {
	return (
		<header className="max-h-8 overflow-hidden border-b border-zinc-800 w-full flex items-center justify-between bg-black sticky top-0 left-0 right-0 z-0">
			<div className="flex items-center ">
				<RefetchBtn />
				<FilterPopup />
				<AddRecordBtn />
				<SaveBtn />
				<ClearBtn
					table={table}
					rowVirtualizer={rowVirtualizer}
				/>
				<DeleteBtn />
			</div>

			<div className="flex items-center ">
				<SettingsBtn />
			</div>
		</header>
	);
};
