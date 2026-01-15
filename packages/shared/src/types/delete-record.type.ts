export type DeleteRecordParams = {
	tableName: string;
	primaryKeys: Array<{ columnName: string; value: unknown }>;
	database?: string;
};

export type ForeignKeyConstraint = {
	constraintName: string;
	referencingTable: string;
	referencingColumn: string;
	referencedTable: string;
	referencedColumn: string;
};

export type ForeignKeyConstraintRow = {
	constraint_name: string;
	referencing_table: string;
	referencing_column: string;
	referenced_table: string;
	referenced_column: string;
};

export type RelatedRecord = {
	tableName: string;
	columnName: string;
	constraintName: string;
	records: Array<Record<string, unknown>>;
};

export type DeleteResult = {
	success: boolean;
	message: string;
	deletedCount?: number;
	fkViolation?: boolean;
	relatedRecords?: RelatedRecord[];
};
