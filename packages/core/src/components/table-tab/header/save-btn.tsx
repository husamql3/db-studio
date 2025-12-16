import { Button } from "@/components/ui/button";
export const SaveBtn = () => {
	return (
		<Button
			type="button"
			variant="default"
			className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none bg-green-700 text-white hover:bg-green-800"
			// onClick={handleRefetch}
			aria-label="Save changes to the table"
		>
			Save Changes
		</Button>
	);
};
