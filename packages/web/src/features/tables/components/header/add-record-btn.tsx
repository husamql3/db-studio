import { Button } from "@db-studio/ui/button";
import { useOverlayStore } from "@/stores/overlay.store";
export const AddRecordBtn = () => {
	const { openOverlay } = useOverlayStore();

	return (
		<Button
			type="button"
			variant="default"
			className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
			onClick={() => openOverlay("records.add-record")}
			aria-label="Add a new record to the table"
		>
			Add Record
		</Button>
	);
};
