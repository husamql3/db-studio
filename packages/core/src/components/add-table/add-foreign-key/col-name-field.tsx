import { Controller, useFormContext } from "react-hook-form";
import type { AddTableFormData } from "shared/types";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

// todo: add data types

export const ColNameField = ({ index }: { index: number }) => {
	const { control, watch } = useFormContext<AddTableFormData>();
	const columns = watch("fields")?.filter((column) =>
		column.columnName?.trim(),
	);
	const columnName = watch(`fields.${index}.columnName`);

	console.log("columns", watch("fields"));
	console.log("columnName", columnName);

	return (
		<Controller
			control={control}
			name={`foreignKeys.${index}`}
			render={({ field }) => (
				<div className="flex flex-col gap-2 flex-1">
					<Select
						defaultValue={columnName || "none"}
						value={field.value?.columnName}
						onValueChange={(value) =>
							field.onChange({ ...field.value, columnName: value })
						}
					>
						<SelectTrigger className="w-full flex-1">
							<SelectValue
								placeholder={
									columns?.length ? "Select a column" : "No columns found"
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{columns?.length > 0 ? (
								columns.map((column) => (
									<SelectItem
										key={column.columnName}
										value={column.columnName}
									>
										{column.columnName}
									</SelectItem>
								))
							) : (
								<SelectItem
									value="none"
									disabled
								>
									No columns found
								</SelectItem>
							)}
						</SelectContent>
					</Select>
				</div>
			)}
		/>
	);
};
