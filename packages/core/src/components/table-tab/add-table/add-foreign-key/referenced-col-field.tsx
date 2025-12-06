import { useQuery } from "@tanstack/react-query";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { queries } from "@/providers/queries";
import type { AddTableFormData } from "@/types/add-table.type";

export const ReferencedColField = ({ index }: { index: number }) => {
	const { control } = useFormContext<AddTableFormData>();
	const foreignKeyData = useWatch({
		control,
		name: `foreignKeys.${index}`,
	});

	const { data: tableCols, isLoading: isLoadingTableCols } = useQuery(
		queries.tableCols(foreignKeyData?.referencedTable || ""),
	);

	if (!foreignKeyData) return null;

	return (
		<Controller
			control={control}
			name={`foreignKeys.${index}`}
			render={({ field }) => (
				<Select
					value={field.value?.referencedColumn}
					onValueChange={(value) =>
						field.onChange({ ...field.value, referencedColumn: value })
					}
					disabled={isLoadingTableCols}
				>
					<SelectTrigger
						className="w-full flex-1"
						disabled={isLoadingTableCols || !tableCols?.length}
					>
						<SelectValue
							placeholder={tableCols?.length ? "Select a column" : "No columns found"}
						/>
					</SelectTrigger>
					<SelectContent>
						{tableCols && tableCols.length > 0 && isLoadingTableCols ? (
							<SelectItem
								value="none"
								disabled
							>
								No columns found
							</SelectItem>
						) : (
							tableCols
								?.filter((column) => column.columnName?.trim())
								.map((column) => (
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
