import { MainContent } from "@/components/components/main-content";
import { Tabs } from "@/components/components/tabs";
import { Sidebar } from "@/components/sidebar/sidebar";
import { AddRowForm } from "@/components/table-tab/add-row-form";
import { AddTableForm } from "@/components/table-tab/add-table/add-table-form";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { cn } from "@/utils/cn";

const App = () => {
	const {
		sidebar: { isPinned, width },
	} = usePersonalPreferencesStore();

	return (
		<div className="bg-zinc-950 w-dvw flex h-dvh max-h-dvh overflow-hidden">
			<Sidebar />

			<div className={cn("flex-1 flex flex-col h-full overflow-hidden", isPinned && `ml-[${width}px]`)}>
				<Tabs />
				<MainContent />
			</div>

			{/* Add Table Form */}
			<AddTableForm />
			{/* Add Row Form */}
			<AddRowForm />
		</div>
	);
};

export default App;
