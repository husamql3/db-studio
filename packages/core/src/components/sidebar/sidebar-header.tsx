import { IconPin, IconPinFilled, IconPlus } from "@tabler/icons-react";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const SidebarHeader = () => {
	const {
		sidebar: { isPinned },
		setSidebarOpen,
		toggleSidebarPinned,
	} = usePersonalPreferencesStore();

	return (
		<div className="flex items-center justify-between h-9 border-b border-zinc-800">
			<button
				type="button"
				onClick={toggleSidebarPinned}
				className="size-8 flex items-center justify-center rounded-lg transition-color"
				title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
			>
				{isPinned ? <IconPinFilled className="size-4" /> : <IconPin className="size-4" />}
			</button>

			{!isPinned && (
				<button
					type="button"
					onClick={() => setSidebarOpen(false)}
					className="size-8 flex items-center justify-center rounded-lg transition-color"
					title="Close sidebar"
				>
					<IconPlus className="size-4 rotate-45" />
				</button>
			)}
		</div>
	);
};
