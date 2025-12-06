import { useSheetStore } from "@/stores/sheet.store";

export const AddRecordBtn = () => {
	const { openSheet } = useSheetStore();

	return (
		<button
			type="button"
			className="h-8 border-r border-zinc-800 px-3 flex items-center justify-center text-sm font-medium hover:bg-zinc-900 transition-colors text-zinc-400"
			onClick={() => openSheet("add-row")}
		>
			Add Record
		</button>
	);
};
