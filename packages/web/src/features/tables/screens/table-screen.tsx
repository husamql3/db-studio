import {
	AddRecordForm,
	BulkInsertCsvSheet,
	BulkInsertExcelSheet,
	BulkInsertJsonSheet,
	BulkInsertSheet,
} from "@/features/records";
import { TableTab } from "../components/table-tab";

export const TableScreen = ({ tableName }: { tableName: string }) => {
	return (
		<main
			key={tableName}
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
