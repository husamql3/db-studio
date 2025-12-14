import { SidebarHeader } from "@/components/sidebar/sidebar-header";
import { SidebarList } from "@/components/sidebar/sidebar-list";
import { SidebarSearch } from "@/components/sidebar/sidebar-search";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const Sidebar = () => {
	const {
		sidebar: { width, isOpen, isPinned },
		setSidebarOpen,
	} = usePersonalPreferencesStore();

	const handleOpenChange = (open: boolean) => {
		if (!isPinned) {
			setSidebarOpen(open);
		}
	};

	return (
		<Sheet
			open={isOpen}
			onOpenChange={handleOpenChange}
			modal={false}
		>
			<SheetTrigger>Open</SheetTrigger>
			<SheetContent
				side="left"
				showCloseButton={false}
				className="bg-black fixed"
				style={{ width: `${width}px !important` }}
			>
				<SidebarHeader />
				<SidebarSearch />
				<SidebarList />
			</SheetContent>
		</Sheet>
	);
};
