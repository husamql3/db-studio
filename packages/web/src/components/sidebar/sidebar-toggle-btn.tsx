import { Button } from "@db-studio/ui/button";
import { cn } from "@db-studio/ui/utils";
import { PanelLeft } from "lucide-react";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const SidebarToggleButton = ({ className }: { className?: string }) => {
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
			aria-label={isPinned ? "Hide sidebar" : "Show sidebar"}
			className={cn(
				"h-full aspect-square border-l-0 border-y-0 border-r border-border rounded-none text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors",
				className,
			)}
		>
			<PanelLeft className="size-5" />
		</Button>
	);
};
