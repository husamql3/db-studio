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
