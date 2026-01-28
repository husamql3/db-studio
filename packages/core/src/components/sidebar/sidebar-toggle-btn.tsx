import { PanelLeft, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const SidebarToggleButton = () => {
	const {
		sidebar: { isOpen, isPinned },
		setSidebarOpen,
		setSidebarPinned,
	} = usePersonalPreferencesStore();

	const handleClick = () => {
		setSidebarOpen(!isOpen);
		setSidebarPinned(!isPinned);
	};

	return (
		<Button
			variant="ghost"
			onClick={handleClick}
			className="h-full aspect-square border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
		>
			{isOpen ? <PanelLeftClose className="size-5" /> : <PanelLeft className="size-5" />}
		</Button>
	);
};
