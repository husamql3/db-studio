import { type CreateTableSchemaType, foreignKeyDataSchema } from "@db-studio/shared/types";
import { z } from "zod";
import { columnFieldSchema } from "@/features/schema";

/** A column row's foreign key; its own column is the row's. */
const columnForeignKeySchema = foreignKeyDataSchema.omit({ columnName: true });

export const addTableSchema = z.object({
	tableName: z.string().min(1, "Table name is required"),
	fields: z
		.array(columnFieldSchema.extend({ foreignKey: columnForeignKeySchema.optional() }))
		.min(1, "At least one column is required"),
});

export type AddTableFormData = z.infer<typeof addTableSchema>;

/** A foreign key without both a referenced table and column is left out, as unfinished. */
export const toCreateTablePayload = ({
	tableName,
	fields,
}: AddTableFormData): CreateTableSchemaType => ({
	tableName,
	fields: fields.map(({ foreignKey: _foreignKey, ...field }) => field),
	foreignKeys: fields.flatMap(({ columnName, foreignKey }) =>
		foreignKey?.referencedTable && foreignKey.referencedColumn
			? [{ columnName, ...foreignKey }]
			: [],
	),
});
