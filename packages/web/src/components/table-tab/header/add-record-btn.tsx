import { Button } from "@/components/ui/button";
import { useSheetStore } from "@/stores/sheet.store";
export const AddRecordBtn = () => {
	const { openSheet } = useSheetStore();

	return (
		<Button
			type="button"
			variant="default"
			className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
			onClick={() => openSheet("add-record")}
			aria-label="Add a new record to the table"
		>
			Add Record
		</Button>
	);
};
