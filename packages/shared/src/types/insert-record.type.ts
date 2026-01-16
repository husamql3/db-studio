export type InsertRecordParams = {
	tableName: string;
	data: Record<string, unknown>;
	database?: string;
};
