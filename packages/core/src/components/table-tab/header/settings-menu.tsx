import { IconSettings } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

export const SettingsBtn = () => {
	return (
		<Button
			type="button"
			variant="ghost"
			className="size-8! aspect-square border-r-0 border-y-0 border-l border-zinc-800 rounded-none"
			aria-label="Open settings menu"
		>
			<IconSettings className="size-4" />
		</Button>
	);
};
