export interface FieldData {
	columnName: string;
	columnType: string;
	defaultValue: string;
	isPrimaryKey: boolean;
	isNullable: boolean;
	isUnique: boolean;
	isIdentity: boolean;
	isArray: boolean;
}

export type ForeignKeyAction =
	| "CASCADE"
	| "SET NULL"
	| "SET DEFAULT"
	| "RESTRICT"
	| "NO ACTION";

export interface ForeignKeyData {
	columnName: string;
	referencedTable: string;
	referencedColumn: string;
	onUpdate: ForeignKeyAction;
	onDelete: ForeignKeyAction;
}

export interface AddTableFormData {
	tableName: string;
	fields: FieldData[];
	foreignKeys?: ForeignKeyData[];
}
