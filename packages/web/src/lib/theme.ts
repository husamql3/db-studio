export type Theme = "dark" | "light" | "system";

type ResolvedTheme = "dark" | "light";

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export const systemPrefersDark = () => window.matchMedia(COLOR_SCHEME_QUERY).matches;

export const subscribeToSystemTheme = (callback: () => void) => {
	const query = window.matchMedia(COLOR_SCHEME_QUERY);
	query.addEventListener("change", callback);

	return () => query.removeEventListener("change", callback);
};

export const resolveTheme = (theme: Theme, prefersDark: boolean): ResolvedTheme =>
	theme === "system" ? (prefersDark ? "dark" : "light") : theme;
