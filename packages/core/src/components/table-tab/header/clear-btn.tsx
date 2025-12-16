import { Button } from "@/components/ui/button";
export const ClearBtn = () => {
	return (
		<Button
			type="button"
			variant="secondary"
			className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
			// onClick={handleRefetch}
			aria-label="Save changes to the table"
		>
			Clear Changes
		</Button>
	);
};
