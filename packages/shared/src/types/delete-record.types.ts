import { z } from "zod";
import type { DatabaseSchemaType } from "./database.types";

export const deleteRecordSchema = z.object({
	tableName: z.string("Table name is required"),
	primaryKeys: z
		.array(
			z.object({
				columnName: z.string("Column name is required"),
				value: z.any(),
			}),
		)
		.min(1, "At least one primary key is required"),
});

export type DeleteRecordSchemaType = z.infer<typeof deleteRecordSchema>;

export type DeleteRecordParams = DeleteRecordSchemaType & {
	db: DatabaseSchemaType["db"];
};

export type DeleteResult =
	| { deletedCount: number }
	| {
			deletedCount: number;
			fkViolation: true;
			relatedRecords: RelatedRecord[];
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
