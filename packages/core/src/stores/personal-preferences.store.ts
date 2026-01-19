import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light" | "system";

type PersonalPreferencesState = {
	sidebar: {
		width: number;
		isOpen: boolean;
		isPinned: boolean;
	};
	runnerResults: {
		height: number;
	};
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
	setSidebarWidth: (width: number) => void;
	setSidebarOpen: (isOpen: boolean) => void;
	setSidebarPinned: (isPinned: boolean) => void;
	toggleSidebarOpen: () => void;
	toggleSidebarPinned: () => void;
	setRunnerResultsHeight: (height: number) => void;
};

export const usePersonalPreferencesStore = create<PersonalPreferencesState>()(
	persist(
		(set) => ({
			sidebar: {
				width: 400,
				isOpen: true,
				isPinned: true,
			},
			runnerResults: {
				height: 300,
			},
			theme: "system",
			setTheme: (theme) => set({ theme: theme }),
			toggleTheme: () =>
				set((state) => ({
					theme: state.theme === "dark" ? "light" : "dark",
				})),
			setSidebarWidth: (width) =>
				set((state) => ({
					sidebar: {
						...state.sidebar,
						width: Math.max(250, Math.min(500, width)),
					},
				})),
			setSidebarOpen: (isOpen) =>
				set((state) => ({
					sidebar: { ...state.sidebar, isOpen },
				})),
			setSidebarPinned: (isPinned) =>
				set((state) => ({
					sidebar: { ...state.sidebar, isPinned },
				})),
			toggleSidebarOpen: () =>
				set((state) => ({
					sidebar: { ...state.sidebar, isOpen: !state.sidebar.isOpen },
				})),
			toggleSidebarPinned: () =>
				set((state) => ({
					sidebar: {
						...state.sidebar,
						isPinned: !state.sidebar.isPinned,
					},
				})),
			setRunnerResultsHeight: (height) =>
				set((state) => ({
					runnerResults: {
						...state.runnerResults,
						height: Math.max(150, Math.min(800, height)),
					},
				})),
		}),
		{
			name: "db-studio-personal-preferences",
		},
	),
);
