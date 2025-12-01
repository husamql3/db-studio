import { Controller, useFormContext } from "react-hook-form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { AddTableFormData } from "@/types/add-table.type";

// todo: add data types

export const ColNameField = ({ index }: { index: number }) => {
	const { control, watch } = useFormContext<AddTableFormData>();
	const columns = watch("fields")?.filter((column) => column.columnName?.trim());
	const columnName = watch(`fields.${index}.columnName`);

	return (
		<Controller
			control={control}
			name={`foreignKeys.${index}`}
			render={({ field }) => (
				<div className="flex flex-col gap-2 w-full">
					<Select
						defaultValue={columnName || "none"}
						value={field.value?.columnName}
						onValueChange={(value) =>
							field.onChange({ ...field.value, columnName: value })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue
								placeholder={columns?.length ? "Select a column" : "No columns found"}
							/>
						</SelectTrigger>
						<SelectContent>
							<SelectItem
								value="none"
								disabled
							>
								No columns found
							</SelectItem>
							{columns.map((column) => (
								<SelectItem
									key={column.columnName}
									value={column.columnName}
								>
									{column.columnName}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}
		/>
	);
};
