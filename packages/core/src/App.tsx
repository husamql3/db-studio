import { ComponentExample } from "@/components/component-example";
import { ModeToggle } from "@/components/mode-toggle";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useTheme } from "@/hooks/use-theme";

export function App() {
	// Trigger the theme hook to apply the theme to the document
	useTheme();

	return (
		<div className="bg-zinc-950 w-dvw flex h-dvh max-h-dvh overflow-hidden">
			<Sidebar />
			<ModeToggle />
			<ComponentExample />
		</div>
	);
}

export default App;
