import { SettingsIcon } from "lucide-react";

export const SettingsBtn = () => {
	return (
		<button
			type="button"
			className="aspect-square size-8 border-l border-zinc-800 flex items-center justify-center text-sm font-medium hover:bg-zinc-900 transition-colors text-zinc-400"
		>
			<SettingsIcon className="size-4" />
		</button>
	);
};
