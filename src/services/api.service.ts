type Table = {
	tableName: string;
	rowCount: number;
};

export const getTables = async (): Promise<Table[]> => {
	try {
		const response = await fetch("/api/tables");
		const data = await response.json();
		console.log("getTables", data);
		return data;
	} catch (error) {
		console.error("Error fetching tables:", error);
		throw error;
	}
};

type TableColumn = {
	name: string;
	type: string;
	udtName: string;
	maxLength: number;
	precision: number;
	scale: number;
	nullable: boolean;
	defaultValue: string;
	isPrimaryKey: boolean;
	isAutoIncrement: boolean;
};

export const getTableColumns = async (tableName: string): Promise<TableColumn[]> => {
	try {
		const response = await fetch(`/api/tables/${tableName}`);
		const data = await response.json();
		console.log("getTableColumns", data);
		return data;
	} catch (error) {
		console.error("Error fetching table:", error);
		throw error;
	}
};

export type TableData = {
	[key: string]: unknown;
};

export const getTableData = async (tableName: string): Promise<TableData[]> => {
	try {
		const response = await fetch(`/api/tables/data/${tableName}`);
		const data = await response.json();
		console.log("getTableData", data);
		return data;
	} catch (error) {
		console.error("Error fetching table data:", error);
		throw error;
	}
};

// const {
// 	data: tableColumns,
// 	isLoading: isLoadingTableColumns,
// 	error: errorTableColumns,
// } = useQuery({
// 	queryKey: ["table-header", activeTable],
// 	queryFn: () => getTableColumns(activeTable),
// 	enabled: !!activeTable,
// });

// const {
// 	data,
// 	isLoading: isLoadingTableData,
// 	error: errorTableData,
// } = useQuery({
// 	queryKey: ["table-rows", activeTable],
// 	queryFn: () => getTableData(activeTable),
// 	enabled: !!activeTable,
// });
