import { AddRecordBtn } from "./add-record-btn";
import { ClearBtn } from "./clear-btn";
import { DeleteBtn } from "./delete-btn";
import { FilterPopup } from "./filter-popup";
import { RefetchBtn } from "./refetch-btn";
import { SaveBtn } from "./save-btn";
import { SettingsBtn } from "./settings-menu";

export const TableHeader = () => {
	return (
		<header className="max-h-8 overflow-hidden border-b border-zinc-800 w-full flex items-center justify-between bg-black sticky top-0 left-0 right-0 z-0">
			<div className="flex items-center ">
				<RefetchBtn />
				<FilterPopup />
				<AddRecordBtn />
				<SaveBtn />
				<ClearBtn />
				<DeleteBtn />
			</div>

			<div className="flex items-center">
				<SettingsBtn />
			</div>
		</header>
	);
};
