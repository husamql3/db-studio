import { create } from "zustand";
import { persist } from "zustand/middleware";

type Query = {
	id: string;
	name: string;
	description?: string;
	query: string;
	isFavorite: boolean;
	isSelected: boolean;
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

	// folder ops
	addFolder: (folder: QueryFolder) => void;
	updateFolder: (id: string, updates: Partial<QueryFolder>) => void;
	deleteFolder: (id: string) => void;
	toggleFolder: (id: string) => void;
	toggleFavoriteFolder: (id: string) => void;

	// query ops
	addQuery: () => string;
	updateQuery: (id: string, updates: Partial<Query>) => void;
	deleteQuery: (id: string) => void;
	moveQuery: (queryId: string, folderId?: string) => void;
	toggleFavorite: (id: string) => void;

	// helpers
	getQueriesByFolder: (folderId?: string) => Query[];
	getFavoriteQueries: () => Query[];
	getFavoriteFolders: () => QueryFolder[];
	getSelectedQuery: () => Query | undefined;
};

const INITIAL_FOLDERS: QueryFolder[] = [
	{
		id: "folder-1",
		name: "Analytics",
		isExpanded: true,
		isFavorite: true,
	},
	{
		id: "folder-2",
		name: "Reports",
		isExpanded: false,
		isFavorite: false,
	},
	{
		id: "folder-3",
		name: "Development",
		isExpanded: true,
		isFavorite: true,
	},
];

const INITIAL_QUERIES: Query[] = [
	{
		id: "query-1",
		name: "Active Users",
		query: "SELECT * FROM users WHERE status = 'active' ORDER BY created_at DESC",
		description: "Get all active users",
		folderId: "folder-1",
		isFavorite: true,
		isSelected: true,
	},
	{
		id: "query-2",
		name: "Revenue by Month",
		query:
			"SELECT DATE_TRUNC('month', created_at) as month, SUM(amount) as revenue FROM orders GROUP BY month ORDER BY month DESC",
		description: "Monthly revenue breakdown",
		folderId: "folder-1",
		isFavorite: true,
		isSelected: false,
	},
	{
		id: "query-3",
		name: "Top Products",
		query:
			"SELECT p.name, COUNT(oi.id) as order_count FROM products p JOIN order_items oi ON p.id = oi.product_id GROUP BY p.id ORDER BY order_count DESC LIMIT 10",
		description: "Top 10 best selling products",
		folderId: "folder-1",
		isFavorite: false,
		isSelected: false,
	},
	{
		id: "query-4",
		name: "Monthly Sales Report",
		query: "SELECT * FROM sales_summary WHERE month = CURRENT_DATE - INTERVAL '1 month'",
		description: "Last month's sales summary",
		folderId: "folder-2",
		isFavorite: false,
		isSelected: false,
	},
	{
		id: "query-5",
		name: "Customer Retention",
		query:
			"SELECT cohort_month, retention_rate FROM customer_retention_analysis ORDER BY cohort_month DESC",
		description: "Customer retention metrics by cohort",
		folderId: "folder-2",
		isFavorite: true,
		isSelected: false,
	},
	{
		id: "query-6",
		name: "Debug Failed Orders",
		query:
			"SELECT * FROM orders WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'",
		description: "Recent failed orders for debugging",
		folderId: "folder-3",
		isFavorite: false,
		isSelected: false,
	},
	{
		id: "query-7",
		name: "Database Migrations",
		query: "SELECT * FROM schema_migrations ORDER BY version DESC",
		description: "Check migration status",
		folderId: "folder-3",
		isFavorite: false,
		isSelected: false,
	},
	{
		id: "query-8",
		name: "All Tables",
		query:
			"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
		description: "List all database tables",
		folderId: undefined,
		isFavorite: true,
		isSelected: false,
	},
	{
		id: "query-9",
		name: "Recent Logs",
		query:
			"SELECT * FROM logs WHERE created_at > NOW() - INTERVAL '1 hour' ORDER BY created_at DESC LIMIT 100",
		description: "Last hour of application logs",
		folderId: undefined,
		isFavorite: false,
		isSelected: false,
	},
];

export const useQueriesStore = create<QueriesStore>()(
	persist(
		(set, get) => ({
			folders: INITIAL_FOLDERS,
			queries: INITIAL_QUERIES,

			addFolder: (folder) => set((state) => ({ folders: [...state.folders, folder] })),

			updateFolder: (id, updates) =>
				set((state) => ({
					folders: state.folders.map((f) => (f.id === id ? { ...f, ...updates } : f)),
				})),

			deleteFolder: (id) =>
				set((state) => ({
					folders: state.folders.filter((f) => f.id !== id),
					queries: state.queries.map((q) =>
						q.folderId === id ? { ...q, folderId: undefined } : q,
					),
				})),

			toggleFolder: (id) =>
				set((state) => ({
					folders: state.folders.map((f) =>
						f.id === id ? { ...f, isExpanded: !f.isExpanded } : f,
					),
				})),

			toggleFavoriteFolder: (id) =>
				set((state) => ({
					folders: state.folders.map((f) =>
						f.id === id ? { ...f, isFavorite: !f.isFavorite } : f,
					),
				})),

			addQuery: () => {
				const newId = Math.random().toString(36).substring(2, 15);
				const newQuery: Query = {
					id: newId,
					name: "Untitled Query",
					query: "",
					isFavorite: false,
					isSelected: true,
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

			getFavoriteFolders: () => {
				const state = get();
				return state.folders.filter((f) => f.isFavorite);
			},

			getSelectedQuery: () => {
				const state = get();
				return state.queries.find((q) => q.isSelected);
			},
		}),
		{
			name: "dbstudio-queries",
		},
	),
);
