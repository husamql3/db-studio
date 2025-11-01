import { dummyTables } from "../utils/data";

export const getTables = async (): Promise<string[]> => {
	await new Promise((resolve) => setTimeout(resolve, 1000));
	return dummyTables;
};
