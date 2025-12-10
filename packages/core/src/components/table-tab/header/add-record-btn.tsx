import { Button } from "@/components/ui/button";
import { useSheetStore } from "@/stores/sheet.store";

export const AddRecordBtn = () => {
	const { openSheet } = useSheetStore();

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="rounded-none h-9 border-r border-zinc-800 flex items-center justify-center text-xs font-medium hover:bg-zinc-900 transition-colors text-zinc-400"
			onClick={() => openSheet("add-row")}
		>
			Add Record
		</Button>
	);
};
