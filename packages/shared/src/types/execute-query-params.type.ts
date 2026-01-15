export type ExecuteQueryResponse = {
	columns: string[];
	rows: Record<string, unknown>[];
	rowCount: number;
	duration: number;
	message?: string;
	error?: string;
};
