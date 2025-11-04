import { AddRecordBtn } from "./add-record-btn";
import { FilterPopup } from "./filter-popup";
import { RefetchButton } from "./refetch-button";

export const Header = () => {
	return (
		<header className="h-8 border-b border-zinc-800 w-full flex items-center bg-black">
			<FilterPopup />
			<RefetchButton />
			<AddRecordBtn />
		</header>
	);
};
