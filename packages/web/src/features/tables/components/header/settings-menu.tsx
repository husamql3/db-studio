import { Button } from "@db-studio/ui/button";
import { Settings } from "lucide-react";
import { useOverlayStore } from "@/stores/overlay.store";

// todo: light & dark mode
// todo: json cell tab size

export const SettingsBtn = () => {
	const { openOverlay } = useOverlayStore();

	return (
		<Button
			type="button"
			variant="ghost"
			className="size-8! aspect-square border-r-0 border-y-0 border-l border-zinc-800 rounded-none"
			aria-label="Open settings menu"
			onClick={() => openOverlay("settings.ai")}
		>
			<Settings className="size-4" />
		</Button>
	);
};
