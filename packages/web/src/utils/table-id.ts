/** Tells same-named tables in different schemas apart. */
export const tableId = ({
	schemaName,
	tableName,
}: {
	schemaName?: string;
	tableName: string;
}) => (schemaName ? `${schemaName}.${tableName}` : tableName);
