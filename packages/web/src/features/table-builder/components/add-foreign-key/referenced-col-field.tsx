import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { Controller, useFormContext } from "react-hook-form";
import type { AddTableFormData } from "@/features/table-builder/types";
import { useTableCols } from "@/hooks/use-table-cols";

export const ReferencedColField = ({
	index,
	tableName,
}: {
	index: number;
	tableName: string;
}) => {
	// CREATE TABLE names the referenced table bare, so its columns resolve the same way.
	const { tableCols, isLoadingTableCols } = useTableCols({ tableName, schemaName: undefined });
	const { control } = useFormContext<AddTableFormData>();
	const columns = tableCols?.filter((column) => column.columnName?.trim()) ?? [];

	return (
		<Controller
			control={control}
			name={`fields.${index}.foreignKey.referencedColumn`}
			render={({ field }) => (
				<Select
					value={field.value}
					onValueChange={field.onChange}
					disabled={isLoadingTableCols}
				>
					<SelectTrigger
						id={field.name}
						className="w-full flex-1"
						disabled={isLoadingTableCols || columns.length === 0}
					>
						<SelectValue
							placeholder={columns.length > 0 ? "Select a column" : "No columns found"}
						/>
					</SelectTrigger>
					<SelectContent>
						{columns.length === 0 ? (
							<SelectItem
								value="none"
								disabled
							>
								No columns found
							</SelectItem>
						) : (
							columns.map((column) => (
								<SelectItem
									key={column.columnName}
									value={column.columnName}
								>
									{column.columnName}
								</SelectItem>
							))
						)}
					</SelectContent>
				</Select>
			)}
		/>
	);
};
