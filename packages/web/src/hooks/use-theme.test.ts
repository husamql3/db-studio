import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { getResolvedTheme, isDarkTheme } from "@/lib/theme";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { useTheme } from "./use-theme";

let mediaListeners: Array<() => void> = [];
let matchesDark = true;

function setupMockMatchMedia(initialMatches: boolean) {
	matchesDark = initialMatches;
	mediaListeners = [];
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: (query: string) => ({
			matches: matchesDark,
			media: query,
			onchange: null,
			addEventListener: (_event: string, listener: () => void) => {
				mediaListeners.push(listener);
			},
			removeEventListener: (_event: string, listener: () => void) => {
				mediaListeners = mediaListeners.filter((l) => l !== listener);
			},
			addListener: (_listener: () => void) => {},
			removeListener: (_listener: () => void) => {},
			dispatchEvent: () => true,
		}),
	});
}

describe("Theme utilities and useTheme hook", () => {
	beforeEach(() => {
		setupMockMatchMedia(true);
		document.documentElement.className = "";
		usePersonalPreferencesStore.setState({ theme: "dark" });
	});

	describe("getResolvedTheme & isDarkTheme", () => {
		it("resolves explicit dark and light themes", () => {
			expect(getResolvedTheme("dark")).toBe("dark");
			expect(isDarkTheme("dark")).toBe(true);

			expect(getResolvedTheme("light")).toBe("light");
			expect(isDarkTheme("light")).toBe(false);
		});

		it("resolves system theme based on matchMedia", () => {
			matchesDark = true;
			expect(getResolvedTheme("system")).toBe("dark");
			expect(isDarkTheme("system")).toBe(true);

			matchesDark = false;
			expect(getResolvedTheme("system")).toBe("light");
			expect(isDarkTheme("system")).toBe(false);
		});
	});

	describe("usePersonalPreferencesStore theme toggle", () => {
		it("toggles between dark and light", () => {
			usePersonalPreferencesStore.setState({ theme: "dark" });
			usePersonalPreferencesStore.getState().toggleTheme();
			expect(usePersonalPreferencesStore.getState().theme).toBe("light");

			usePersonalPreferencesStore.getState().toggleTheme();
			expect(usePersonalPreferencesStore.getState().theme).toBe("dark");
		});

		it("toggles system theme depending on resolved state", () => {
			matchesDark = true;
			usePersonalPreferencesStore.setState({ theme: "system" });
			usePersonalPreferencesStore.getState().toggleTheme();
			expect(usePersonalPreferencesStore.getState().theme).toBe("light");

			matchesDark = false;
			usePersonalPreferencesStore.setState({ theme: "system" });
			usePersonalPreferencesStore.getState().toggleTheme();
			expect(usePersonalPreferencesStore.getState().theme).toBe("dark");
		});
	});

	describe("useTheme", () => {
		it("returns resolved theme and updates DOM classes", () => {
			const { result } = renderHook(() => useTheme());

			expect(result.current.theme).toBe("dark");
			expect(result.current.resolvedTheme).toBe("dark");
			expect(result.current.isDark).toBe(true);
			expect(document.documentElement.classList.contains("dark")).toBe(true);

			act(() => {
				result.current.setTheme("light");
			});

			expect(result.current.theme).toBe("light");
			expect(result.current.resolvedTheme).toBe("light");
			expect(result.current.isDark).toBe(false);
			expect(document.documentElement.classList.contains("light")).toBe(true);
		});

		it("reactively updates when matchMedia fires in system mode", () => {
			matchesDark = true;
			const { result } = renderHook(() => useTheme());

			act(() => {
				result.current.setTheme("system");
			});

			expect(result.current.resolvedTheme).toBe("dark");
			expect(result.current.isDark).toBe(true);

			act(() => {
				matchesDark = false;
				for (const listener of mediaListeners) {
					listener();
				}
			});

			expect(result.current.resolvedTheme).toBe("light");
			expect(result.current.isDark).toBe(false);
			expect(document.documentElement.classList.contains("light")).toBe(true);
		});
	});
});
