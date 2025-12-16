import { IconFilter } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

export const FilterPopup = () => {
	return (
		<Button
			type="button"
			variant="ghost"
			className="size-8! aspect-square border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
			// onClick={handleRefetch}
			aria-label="Refetch table data and columns"
		>
			<IconFilter className="size-4" />
		</Button>
	);
};
