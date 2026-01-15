export type UpdateRecordParams = {
	tableName: string;
	updates: Array<{
		rowData: Record<string, unknown>; // Original row data to identify the record
		columnName: string;
		value: unknown;
	}>;
	primaryKey?: string; // Optional: specify primary key column (defaults to 'id')
	database?: string;
};
