export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export function getResolvedTheme(theme: Theme): ResolvedTheme {
	if (theme === "system") {
		if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
			return window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light";
		}
		return "dark";
	}
	return theme;
}

export function isDarkTheme(theme: Theme): boolean {
	return getResolvedTheme(theme) === "dark";
}
