import { create } from "zustand";

type SortOrder = "asc" | "desc";

type ActiveTableStore = {
	// Table selection
	activeTable: string | null;

	// Pagination
	page: number;
	pageSize: number;

	// Sorting
	sortColumn: string | null;
	sortOrder: SortOrder;

	// Actions
	setActiveTable: (tableName: string | null) => void;
	setPage: (page: number) => void;
	setPageSize: (pageSize: number) => void;
	setSorting: (column: string | null, order: SortOrder) => void;
	resetTableState: () => void;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_SORT_ORDER: SortOrder = "asc";

export const useActiveTableStore = create<ActiveTableStore>((set) => ({
	// Initial state
	activeTable: null,
	page: DEFAULT_PAGE,
	pageSize: DEFAULT_PAGE_SIZE,
	sortColumn: null,
	sortOrder: DEFAULT_SORT_ORDER,

	// Actions
	setActiveTable: (tableName) => {
		set({
			activeTable: tableName,
			// Reset pagination & sorting when switching tables
			page: DEFAULT_PAGE,
			sortColumn: null,
			sortOrder: DEFAULT_SORT_ORDER,
		});
	},

	setPage: (page) => {
		set({ page });
	},

	setPageSize: (pageSize) => {
		set({ pageSize, page: DEFAULT_PAGE }); // Reset to page 1 when changing page size
	},

	setSorting: (column, order) => {
		set({ sortColumn: column, sortOrder: order, page: DEFAULT_PAGE }); // Reset to page 1 when sorting changes
	},

	resetTableState: () => {
		set({
			page: DEFAULT_PAGE,
			pageSize: DEFAULT_PAGE_SIZE,
			sortColumn: null,
			sortOrder: DEFAULT_SORT_ORDER,
		});
	},
}));
