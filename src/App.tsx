import { Sidebar } from "@/components/sidebar/sidebar";
import { MainContent } from "./components/components/main-content";
import { Tabs } from "./components/components/tabs";
import { usePersonalPreferencesStore } from "./store/personal-preferences.store";
import { cn } from "./utils/cn";

const App = () => {
	const {
		sidebar: { isPinned },
	} = usePersonalPreferencesStore();

	return (
		<div className="bg-zinc-950 h-dvh w-dvw flex">
			<Sidebar />

			<div className={cn("flex-1 flex flex-col transition-all duration-300 ease-out", isPinned ? "ml-[260px]" : "")}>
				<Tabs />
				<MainContent />
			</div>
		</div>
	);
};

export default App;
