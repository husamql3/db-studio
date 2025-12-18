import { IconPin, IconPinFilled } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const SidebarHeader = () => {
	const {
		sidebar: { isPinned },
		toggleSidebarPinned,
	} = usePersonalPreferencesStore();

	return (
		<div className="flex items-center justify-between h-9 border-b border-zinc-800">
			<Button
				variant="ghost"
				size="lg"
				onClick={toggleSidebarPinned}
				className="size-9 flex items-center justify-center transition hover:bg-transparent!"
				title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
			>
				{isPinned ? <IconPinFilled className="size-4" /> : <IconPin className="size-4" />}
			</Button>
		</div>
	);
};
