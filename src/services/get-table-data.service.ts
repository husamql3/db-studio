import type { Filter } from "@/stores/active-table.store";

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

export const getTableData = async (
	tableName: string | null,
	page: number = 1,
	pageSize: number = 50,
	sort: string = "",
	order: string = "asc",
	filters: Filter[] = [],
): Promise<TableDataResult | null> => {
	if (!tableName) {
		return null;
	}

	const queryParams = new URLSearchParams();
	queryParams.set("page", page.toString());
	queryParams.set("pageSize", pageSize.toString());
	if (sort) queryParams.set("sort", sort);
	if (order) queryParams.set("order", order);
	if (filters.length > 0) queryParams.set("filters", JSON.stringify(filters));

	try {
		const response = await fetch(
			`/api/tables/${tableName}/data?${queryParams.toString()}`,
		);
		if (!response.ok) {
			throw new Error("Failed to fetch table data");
		}
		return response.json();
	} catch (error) {
		console.error("Error fetching table data:", error);
		throw error;
	}
};
