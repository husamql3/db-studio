import { Button } from "@/components/ui/button";
export const DeleteBtn = () => {
	return (
		<Button
			type="button"
			variant="destructive"
			className="h-8! border-l-0 border-y-0 border-r border-zinc-800 text-white rounded-none"
			// onClick={handleRefetch}
			aria-label="Delete the selected record"
		>
			Delete Record
		</Button>
	);
};
