import type { DatabaseTypeSchema } from "./database.types";

export type DatabaseSchema = {
	dbType: DatabaseTypeSchema;
	tables: Table[];
	relationships: Relationship[];
};

export type Table = {
	name: string;
	description?: string;
	columns: Column[];
	sampleData?: Record<string, string>[];
};

export type Column = {
	name: string;
	type: string;
	nullable: boolean;
	isPrimaryKey?: boolean;
	foreignKey?: string;
	description?: string;
	enumValues?: string[];
};

export type Relationship = {
	fromTable: string;
	fromColumn: string;
	toTable: string;
	toColumn: string;
};
