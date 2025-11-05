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

type ForeignKey = {
	columnName: string;
	foreignTableName: string;
	foreignColumnName: string;
	onUpdate: string;
	onDelete: string;
};

type TableData = {
	name: string;
	columns: TableColumn[];
	primaryKeys: string[];
	foreignKeys: ForeignKey[];
};

export const getTable = async (tableName: string): Promise<TableData[]> => {
	try {
		const response = await fetch(`/api/tables/${tableName}`);
		const data = await response.json();
		console.log("getTable", data);
		return data;
	} catch (error) {
		console.error("Error fetching table:", error);
		throw error;
	}
};
