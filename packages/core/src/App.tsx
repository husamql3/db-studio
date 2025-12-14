import { ComponentExample } from "@/components/component-example";
import { ModeToggle } from "@/components/mode-toggle";
import { useTheme } from "@/hooks/use-theme";

export function App() {
	useTheme(); // trigger the theme hook to apply the theme to the document

	return (
		<>
			<ModeToggle />
			<ComponentExample />
		</>
	);
}

export default App;
