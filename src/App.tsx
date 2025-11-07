import { MainContent } from "@/components/components/main-content";
import { Tabs } from "@/components/components/tabs";
import { Sidebar } from "@/components/sidebar/sidebar";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

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
		</div>
	);
};

export default App;
