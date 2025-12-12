import { API_URL } from "@/utils/constants/constans";

export type TableInfo = {
	tableName: string;
	rowCount: number;
};

export const getTableList = async (): Promise<TableInfo[]> => {
	try {
		const response = await fetch(`${API_URL}/tables`);
		if (!response.ok) {
			throw new Error("Failed to fetch tables list");
		}
		return response.json();
	} catch (error) {
		console.error("Error fetching tables list:", error);
		throw error;
	}
};
