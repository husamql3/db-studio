export interface Filter {
	columnName: string;
	operator: string;
	value: string;
}

export type SortDirection = "asc" | "desc";

export type Sort = {
	columnName: string;
	direction: SortDirection;
};

export interface TableDataResult {
	data: Record<string, unknown>[];
	meta: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
		hasNextPage: boolean;
		hasPreviousPage: boolean;
	};
}
