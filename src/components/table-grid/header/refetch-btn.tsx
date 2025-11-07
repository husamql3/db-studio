import { RefreshCcwIcon } from "lucide-react";

export const RefetchBtn = () => {
	return (
		<button
			type="button"
			className="aspect-square size-8 border-r border-zinc-800 flex items-center justify-center text-sm font-medium hover:bg-zinc-900 transition-colors text-zinc-400"
		>
			<RefreshCcwIcon className="size-4" />
		</button>
	);
};
