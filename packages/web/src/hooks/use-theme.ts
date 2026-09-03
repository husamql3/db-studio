import { useEffect } from "react";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export function useTheme() {
	const theme = usePersonalPreferencesStore((state) => state.theme);

	useEffect(() => {
		const root = window.document.documentElement;

		const applyTheme = (isDark: boolean) => {
			if (isDark) {
				root.classList.add("dark");
				root.classList.remove("light");
				document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#09090b");
			} else {
				root.classList.remove("dark");
				root.classList.add("light");
				document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#ffffff");
			}
		};

		if (theme === "system") {
			const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
			applyTheme(mediaQuery.matches);

			const handleChange = (e: MediaQueryListEvent) => {
				applyTheme(e.matches);
			};

			mediaQuery.addEventListener("change", handleChange);
			return () => mediaQuery.removeEventListener("change", handleChange);
		}

		applyTheme(theme === "dark");
	}, [theme]);
}
