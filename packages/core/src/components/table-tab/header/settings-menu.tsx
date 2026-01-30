import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSheetStore } from "@/stores/sheet.store";

export const SettingsBtn = () => {
	const { openSheet } = useSheetStore();

	return (
		<Button
			type="button"
			variant="ghost"
			className="size-8! aspect-square border-r-0 border-y-0 border-l border-zinc-800 rounded-none"
			aria-label="Open settings menu"
			onClick={() => openSheet("settings")}
		>
			<Settings className="size-4" />
		</Button>
	);
};
