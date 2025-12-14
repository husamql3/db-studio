import { IconLayoutSidebar, IconLayoutSidebarFilled } from "@tabler/icons-react";
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
			className="size-14! aspect-square border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
		>
			{isOpen ? (
				<IconLayoutSidebar className="size-5" />
			) : (
				<IconLayoutSidebarFilled className="size-5" />
			)}
		</Button>
	);
};
