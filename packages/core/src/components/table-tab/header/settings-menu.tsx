import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

// todo: light & dark mode
// todo: json cell tab size

export const SettingsBtn = () => {
	return (
		<Button
			type="button"
			variant="ghost"
			className="size-8! aspect-square border-r-0 border-y-0 border-l border-zinc-800 rounded-none"
			aria-label="Open settings menu"
		>
			<Settings className="size-4" />
		</Button>
	);
};
