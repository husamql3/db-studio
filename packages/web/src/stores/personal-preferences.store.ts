import { create } from "zustand";
import { persist } from "zustand/middleware";
import { resolveTheme, systemPrefersDark, type Theme } from "@/lib/theme";

export const TAB_SIZES = [2, 4, 8] as const;

export type TabSize = (typeof TAB_SIZES)[number];

export const SIDEBAR_DEFAULT_WIDTH = 300;

export const EDITOR_FONT_SIZES = [12, 14, 16, 18] as const;

export type EditorFontSize = (typeof EDITOR_FONT_SIZES)[number];

/** `peek` overlays the content and hides again when the pointer leaves it. */
type SidebarMode = "hidden" | "peek" | "pinned";

type PersonalPreferencesState = {
	sidebar: {
		width: number;
		mode: SidebarMode;
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
	setSidebarMode: (mode: SidebarMode) => void;
	setTabSize: (tabSize: TabSize) => void;
	setEditorFontSize: (fontSize: EditorFontSize) => void;
	setEditorWordWrap: (wordWrap: boolean) => void;
};

export const usePersonalPreferencesStore = create<PersonalPreferencesState>()(
	persist(
		(set, get) => ({
			sidebar: {
				width: SIDEBAR_DEFAULT_WIDTH,
				mode: "pinned",
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
					theme: resolveTheme(get().theme, systemPrefersDark()) === "dark" ? "light" : "dark",
				}),
			setSidebarWidth: (width) =>
				set((state) => ({
					sidebar: {
						...state.sidebar,
						width: Math.max(250, Math.min(500, width)),
					},
				})),
			setSidebarMode: (mode) =>
				set((state) => ({
					sidebar: { ...state.sidebar, mode },
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
			version: 1,
			// Version 0 kept two flags, `isOpen` and `isPinned`.
			migrate: (persisted, version) => {
				// SAFETY: version 0 is the only older shape this key was ever written in.
				const state = persisted as PersonalPreferencesState & {
					sidebar: { width: number; isOpen?: boolean; isPinned?: boolean };
				};

				if (version === 0) {
					const { width, isOpen, isPinned } = state.sidebar;
					const mode: SidebarMode = !isOpen ? "hidden" : isPinned ? "pinned" : "peek";
					state.sidebar = { width, mode };
				}

				return state;
			},
		},
	),
);
