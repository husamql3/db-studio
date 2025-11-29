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

export interface AddTableFormData {
	tableName: string;
	fields: FieldData[];
}
