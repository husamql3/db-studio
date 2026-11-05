import { useSyncExternalStore } from "react";
import { COLOR_SCHEME_QUERY, type ResolvedTheme } from "@/lib/theme";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

function subscribeToSystemTheme(callback: () => void) {
	if (typeof window === "undefined" || !window.matchMedia) {
		return () => {};
	}

	const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY);

	if (typeof mediaQuery.addEventListener === "function") {
		mediaQuery.addEventListener("change", callback);

		return () => {
			mediaQuery.removeEventListener("change", callback);
		};
	}

	if (typeof mediaQuery.addListener === "function") {
		mediaQuery.addListener(callback);

		return () => {
			mediaQuery.removeListener(callback);
		};
	}

	return () => {};
}

function getSystemThemeSnapshot(): boolean {
	if (typeof window === "undefined" || !window.matchMedia) {
		return false;
	}

	return window.matchMedia(COLOR_SCHEME_QUERY).matches;
}

function getSystemThemeServerSnapshot(): boolean {
	return false;
}

export function useTheme() {
	const { theme, setTheme, toggleTheme } = usePersonalPreferencesStore();

	const systemPrefersDark = useSyncExternalStore(
		subscribeToSystemTheme,
		getSystemThemeSnapshot,
		getSystemThemeServerSnapshot,
	);

	const resolvedTheme: ResolvedTheme =
		theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;

	return {
		theme,
		resolvedTheme,
		isDark: resolvedTheme === "dark",
		setTheme,
		toggleTheme,
	};
}
