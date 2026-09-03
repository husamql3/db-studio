import { useEffect, useSyncExternalStore } from "react";
import {
	COLOR_SCHEME_QUERY,
	getResolvedTheme,
	isDarkTheme,
	type ResolvedTheme,
	type Theme,
} from "@/lib/theme";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export type { ResolvedTheme, Theme };
export { COLOR_SCHEME_QUERY, getResolvedTheme, isDarkTheme };

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
	const isDark = resolvedTheme === "dark";

	useEffect(() => {
		const root = window.document.documentElement;
		if (isDark) {
			root.classList.add("dark");
			root.classList.remove("light");
			document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#09090b");
		} else {
			root.classList.remove("dark");
			root.classList.add("light");
			document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#ffffff");
		}
	}, [isDark]);

	return {
		theme,
		resolvedTheme,
		isDark,
		setTheme,
		toggleTheme,
	};
}
