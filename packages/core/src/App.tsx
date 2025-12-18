import { CommandPalette } from "@/components/components/command-palette";
import { Header } from "@/components/components/header";
import { Main } from "@/components/components/main";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { AddTableForm } from "./components/add-table/add-table-form";
import { DevMode } from "./components/components/dev-mode";

export function App() {
	// Trigger the theme hook to apply the theme to the document
	useTheme();

	const {
		sidebar: { isPinned, width },
	} = usePersonalPreferencesStore();

	return (
		<>
			<div className="bg-zinc-950 w-dvw flex h-dvh max-h-dvh overflow-hidden relative">
				<Sidebar />

				<div
					className="flex-1 flex flex-col h-full overflow-hidden "
					style={{
						marginLeft: isPinned ? `${width}px` : "0",
					}}
				>
					<Header />
					<Main />
				</div>

				<CommandPalette />
			</div>

			<DevMode />
			<AddTableForm />
		</>
	);
}

export default App;
