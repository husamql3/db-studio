import { Button } from "@/components/ui/button";
import { useSheetStore } from "@/stores/sheet.store";

export const BulkInsertBtn = () => {
	const { openSheet } = useSheetStore();

	return (
		<Button
			type="button"
			variant="default"
			className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
			onClick={() => openSheet("bulk-insert-records")}
			title="Bulk insert records from CSV or JSON"
		>
			Bulk Insert
		</Button>
	);
};
