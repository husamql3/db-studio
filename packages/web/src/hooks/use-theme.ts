import { useSyncExternalStore } from "react";
import { resolveTheme, subscribeToSystemTheme, systemPrefersDark } from "@/lib/theme";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export function useTheme() {
	const { theme, setTheme, toggleTheme } = usePersonalPreferencesStore();
	const prefersDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark);
	const resolvedTheme = resolveTheme(theme, prefersDark);

	return {
		theme,
		resolvedTheme,
		isDark: resolvedTheme === "dark",
		setTheme,
		toggleTheme,
	};
}
