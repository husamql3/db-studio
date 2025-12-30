export type ChangelogItem = {
	version: string;
	date: string;
	title: string;
	tags?: string[];
	image?: string;
	features?: string[];
	improvements?: string[];
	bugsFixed?: string[];
};

export const changelog: ChangelogItem[] = [
	// add at the top of the array
	{
		version: "1.0.0",
		date: "2025-12-29",
		title: "Initial Release",
	},
];
