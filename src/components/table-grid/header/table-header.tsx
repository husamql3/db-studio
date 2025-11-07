import { AddRecordBtn } from "./add-record-btn";
import { FilterPopup } from "./filter-popup";
import { RefetchBtn } from "./refetch-btn";
import { SettingsBtn } from "./settings-btn";

export const TableHeader = () => {
	return (
		<header className="h-8 border-b border-zinc-800 w-full flex items-center justify-between bg-black">
			<div className="flex items-center">
				<RefetchBtn />
				<FilterPopup />
				<AddRecordBtn />
			</div>

			<div className="flex items-center">
				<SettingsBtn />
			</div>
		</header>
	);
};
