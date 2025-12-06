import { MaximizeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const MaximizeBtn = () => {
	return (
		<Button
			variant="ghost"
			className="aspect-square rounded-none size-8 border-l border-zinc-800 flex items-center justify-center text-sm font-medium hover:bg-zinc-900 transition-colors text-zinc-400"
		>
			<MaximizeIcon className="size-4" />
		</Button>
	);
};
