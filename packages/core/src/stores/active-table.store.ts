import { create } from "zustand";

type SortOrder = "asc" | "desc";

export type Filter = {
	columnName: string;
	operator: string;
	value: string;
};

type ActiveTableStore = {
	// Table selection
	activeTable: string | null;

	// Pagination
	page: number;
	pageSize: number;

	// Sorting
	sortColumn: string | null;
	sortOrder: SortOrder;

	// Filters
	filters: Filter[];

	// Row selection
	selectedRowIndices: number[];

	// Actions
	setActiveTable: (tableName: string | null) => void;
	setPage: (page: number) => void;
	setPageSize: (pageSize: number) => void;
	setSorting: (column: string | null, order: SortOrder) => void;
	resetTableState: () => void;
	setFilters: (filters: Filter[]) => void;
	addFilter: (filter: Filter) => void;
	removeFilter: (index: number) => void;
	clearFilters: () => void;
	setSelectedRowIndices: (indices: number[]) => void;
	toggleRowSelection: (index: number) => void;
	selectRowRange: (startIndex: number, endIndex: number) => void;
	clearRowSelection: () => void;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_SORT_ORDER: SortOrder = "asc";

export const useActiveTableStore = create<ActiveTableStore>((set, get) => ({
	// Initial state
	activeTable: null,
	page: DEFAULT_PAGE,
	pageSize: DEFAULT_PAGE_SIZE,
	sortColumn: null,
	sortOrder: DEFAULT_SORT_ORDER,
	filters: [],
	selectedRowIndices: [],
	// Actions
	setActiveTable: (tableName) => {
		set({
			activeTable: tableName,
			// Reset pagination & sorting when switching tables
			page: DEFAULT_PAGE,
			sortColumn: null,
			sortOrder: DEFAULT_SORT_ORDER,
			filters: [],
			selectedRowIndices: [],
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

	setFilters: (filters) => {
		set({ filters, page: DEFAULT_PAGE }); // Reset to page 1 when filters change
	},

	addFilter: (filter) => {
		set({ filters: [...get().filters, filter], page: DEFAULT_PAGE });
	},

	removeFilter: (index) => {
		set({ filters: get().filters.filter((_, i) => i !== index), page: DEFAULT_PAGE });
	},

	clearFilters: () => {
		set({ filters: [], page: DEFAULT_PAGE });
	},

	resetTableState: () => {
		set({
			page: DEFAULT_PAGE,
			pageSize: DEFAULT_PAGE_SIZE,
			sortColumn: null,
			sortOrder: DEFAULT_SORT_ORDER,
			filters: [],
			selectedRowIndices: [],
		});
	},

	setSelectedRowIndices: (indices) => {
		set({ selectedRowIndices: indices });
	},

	toggleRowSelection: (index) => {
		const { selectedRowIndices } = get();
		const indexPosition = selectedRowIndices.indexOf(index);

		if (indexPosition !== -1) {
			set({ selectedRowIndices: selectedRowIndices.filter((i) => i !== index) });
		} else {
			set({ selectedRowIndices: [...selectedRowIndices, index] });
		}
	},

	selectRowRange: (startIndex, endIndex) => {
		const minIndex = Math.min(startIndex, endIndex);
		const maxIndex = Math.max(startIndex, endIndex);
		const newSelection: number[] = [];
		for (let i = minIndex; i <= maxIndex; i++) {
			newSelection.push(i);
		}
		set({ selectedRowIndices: newSelection });
	},

	clearRowSelection: () => {
		set({ selectedRowIndices: [] });
	},
}));
