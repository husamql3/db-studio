import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getResolvedTheme, type Theme } from "@/lib/theme";

export const TAB_SIZES = [2, 4, 8] as const;
export type TabSize = (typeof TAB_SIZES)[number];

export const EDITOR_FONT_SIZES = [12, 14, 16, 18] as const;
export type EditorFontSize = (typeof EDITOR_FONT_SIZES)[number];

type PersonalPreferencesState = {
	sidebar: {
		width: number;
		isOpen: boolean;
		isPinned: boolean;
	};
	runnerResults: {
		height: number;
	};
	editor: {
		tabSize: TabSize;
		fontSize: EditorFontSize;
		wordWrap: boolean;
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
	setTabSize: (tabSize: TabSize) => void;
	setEditorFontSize: (fontSize: EditorFontSize) => void;
	setEditorWordWrap: (wordWrap: boolean) => void;
};

export const usePersonalPreferencesStore = create<PersonalPreferencesState>()(
	persist(
		(set, get) => ({
			sidebar: {
				width: 400,
				isOpen: true,
				isPinned: true,
			},
			runnerResults: {
				height: 300,
			},
			editor: {
				tabSize: 2,
				fontSize: 14,
				wordWrap: true,
			},
			theme: "dark",
			setTheme: (theme) => set({ theme: theme }),
			toggleTheme: () =>
				set({
					theme: getResolvedTheme(get().theme) === "dark" ? "light" : "dark",
				}),
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
			setTabSize: (tabSize) =>
				set((state) => ({
					editor: { ...state.editor, tabSize },
				})),
			setEditorFontSize: (fontSize) =>
				set((state) => ({
					editor: { ...state.editor, fontSize },
				})),
			setEditorWordWrap: (wordWrap) =>
				set((state) => ({
					editor: { ...state.editor, wordWrap },
				})),
		}),
		{
			name: "db-studio-personal-preferences",
		},
	),
);
