import {
	AddRecordForm,
	BulkInsertCsvSheet,
	BulkInsertExcelSheet,
	BulkInsertJsonSheet,
	BulkInsertSheet,
} from "@/features/records";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { TableTab } from "../components/table-tab";

export const TableScreen = ({ tableName }: { tableName: string }) => {
	// Remount per table, so pending edits and selection never carry over to a same-named table.
	const schemaName = useTableSchemaName();
	return (
		<main
			key={`${schemaName}.${tableName}`}
			className="flex-1 flex flex-col overflow-hidden"
		>
			<TableTab tableName={tableName} />

			<AddRecordForm tableName={tableName} />
			<BulkInsertSheet tableName={tableName} />
			<BulkInsertCsvSheet tableName={tableName} />
			<BulkInsertExcelSheet tableName={tableName} />
			<BulkInsertJsonSheet tableName={tableName} />
		</main>
	);
};
