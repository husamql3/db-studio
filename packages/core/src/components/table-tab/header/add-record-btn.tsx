import { Button } from "@/components/ui/button";
export const AddRecordBtn = () => {
	return (
		<Button
			type="button"
			variant="default"
			className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
			// onClick={handleRefetch}
			aria-label="Add a new record to the table"
		>
			Add Record
		</Button>
	);
};
