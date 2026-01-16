export const DataTypes = {
	text: "text",
	boolean: "boolean",
	number: "number",
	enum: "enum",
	json: "json",
	date: "date",
	array: "array",
} as const;

export type DataTypes = (typeof DataTypes)[keyof typeof DataTypes];
