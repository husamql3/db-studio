import { AddRecordBtn } from "./add-record-btn";
import { FilterPopup } from "./filter-popup";
import { MaximizeBtn } from "./maximize-btn";
import { RefetchBtn } from "./refetch-btn";
import { SettingsBtn } from "./settings-btn";

export const TableHeader = () => {
	return (
		<header className="h-8 border-b border-zinc-800 w-full flex items-center justify-between bg-black sticky top-0 left-0 right-0 z-0">
			<div className="flex items-center">
				<RefetchBtn />
				<FilterPopup />
				<AddRecordBtn />
			</div>

			<div className="flex items-center">
				<MaximizeBtn />
				<SettingsBtn />
			</div>
		</header>
	);
};
