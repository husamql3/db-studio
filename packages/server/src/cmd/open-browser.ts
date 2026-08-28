import open from "open";

export const shouldOpenBrowser = (override?: boolean): boolean => {
	return override === true;
};

export const openBrowser = async (url: string): Promise<void> => {
	await open(url);
};
