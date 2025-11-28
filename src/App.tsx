import { MainContent } from "@/components/components/main-content";
import { Tabs } from "@/components/components/tabs";
import { Sidebar } from "@/components/sidebar/sidebar";
import { AddRowForm } from "@/components/table-tab/add-row-form";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { CommandPalette } from "./components/components/command-palette";
import { AddTableForm } from "./components/table-tab/add-table/add-table-form";

const App = () => {
	const {
		sidebar: { isPinned, width },
	} = usePersonalPreferencesStore();

	return (
		<div className="bg-zinc-950 w-dvw flex h-dvh max-h-dvh overflow-hidden">
			<Sidebar />

			<div
				className="flex-1 flex flex-col h-full overflow-hidden"
				style={{
					marginLeft: isPinned ? `${width}px` : 0,
				}}
			>
				<Tabs />
				<MainContent />
			</div>

			<CommandPalette />
			<AddTableForm />
			<AddRowForm />
		</div>
	);
};

export default App;
