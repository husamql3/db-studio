import { useEffect } from "react";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export function useTheme() {
	const theme = usePersonalPreferencesStore((state) => state.theme);

	useEffect(() => {
		const root = window.document.documentElement;

		root.classList.remove("light", "dark");

		if (theme === "system") {
			const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light";

			root.classList.add(systemTheme);
			return;
		}

		root.classList.add(theme);
	}, [theme]);
}
