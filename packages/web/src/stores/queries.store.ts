import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "dbstudio-queries";

type Query = {
	id: string;
	name: string;
	description?: string;
	query: string;
	isFavorite: boolean;
	folderId?: string;
};

type QueryFolder = {
	id: string;
	name: string;
	isExpanded: boolean;
	isFavorite: boolean;
};

type QueriesStore = {
	folders: QueryFolder[];
	queries: Query[];

	addFolder: (folder: QueryFolder) => void;
	updateFolder: (id: string, updates: Partial<QueryFolder>) => void;
	deleteFolder: (id: string) => void;
	toggleFolder: (id: string) => void;

	/** Saves a new query and returns its id. */
	addQuery: (query?: string, options?: { name?: string; folderId?: string }) => string;
	updateQuery: (id: string, updates: Partial<Query>) => void;
	deleteQuery: (id: string) => void;
	moveQuery: (queryId: string, folderId?: string) => void;
	toggleFavorite: (id: string) => void;

	getQueriesByFolder: (folderId?: string) => Query[];
	getFavoriteQueries: () => Query[];
	getQuery: (id: string) => Query | undefined;
};

export const useQueriesStore = create<QueriesStore>()(
	persist(
		(set, get) => ({
			folders: [],
			queries: [],

			addFolder: (folder) => set((state) => ({ folders: [...state.folders, folder] })),

			updateFolder: (id, updates) =>
				set((state) => ({
					folders: state.folders.map((f) => (f.id === id ? { ...f, ...updates } : f)),
				})),

			deleteFolder: (id) =>
				set((state) => ({
					folders: state.folders.filter((f) => f.id !== id),
					queries: state.queries.filter((q) => q.folderId !== id),
				})),

			toggleFolder: (id) =>
				set((state) => ({
					folders: state.folders.map((f) =>
						f.id === id ? { ...f, isExpanded: !f.isExpanded } : f,
					),
				})),

			addQuery: (query = "", { name, folderId } = {}) => {
				const newId = Math.random().toString(36).substring(2, 15);

				const newQuery: Query = {
					id: newId,
					name: name ?? "Untitled Query",
					query,
					isFavorite: false,
					folderId,
				};

				set((state) => ({
					queries: [...state.queries, newQuery],
				}));

				return newId;
			},

			updateQuery: (id, updates) =>
				set((state) => ({
					queries: state.queries.map((q) => (q.id === id ? { ...q, ...updates } : q)),
				})),

			deleteQuery: (id) =>
				set((state) => ({
					queries: state.queries.filter((q) => q.id !== id),
				})),

			moveQuery: (queryId, folderId) =>
				set((state) => ({
					queries: state.queries.map((q) => (q.id === queryId ? { ...q, folderId } : q)),
				})),

			toggleFavorite: (id) =>
				set((state) => ({
					queries: state.queries.map((q) =>
						q.id === id ? { ...q, isFavorite: !q.isFavorite } : q,
					),
				})),

			getQueriesByFolder: (folderId) => {
				const state = get();

				return state.queries
					.filter((q) => q.folderId === folderId && !q.isFavorite)
					.sort((a, b) => a.name.localeCompare(b.name));
			},

			getFavoriteQueries: () => {
				const state = get();

				return state.queries
					.filter((q) => q.isFavorite)
					.sort((a, b) => a.name.localeCompare(b.name));
			},

			getQuery: (id) => {
				const state = get();

				return state.queries.find((q) => q.id === id);
			},
		}),
		{ name: STORAGE_KEY },
	),
);

// Another tab saved queries: reload them, or this tab's next save would drop that tab's work.
window.addEventListener("storage", (event) => {
	if (event.key === STORAGE_KEY) void useQueriesStore.persist.rehydrate();
});
