import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export function App() {
	// Trigger the theme hook to apply the theme to the document
	useTheme();

	const {
		sidebar: { isPinned, width },
	} = usePersonalPreferencesStore();

	return (
		<div className="bg-zinc-950 w-dvw flex h-dvh max-h-dvh overflow-hidden relative">
			<Sidebar />

			<div
				className="flex-1 flex flex-col h-full overflow-hidden transition-all duration-300"
				style={{
					marginLeft: isPinned ? `${width}px` : "0",
				}}
			>
				<Header />
				{/* <Tabs />
				<MainContent /> */}
			</div>
		</div>
	);
}

export default App;
