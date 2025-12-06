import { Controller, useFormContext } from "react-hook-form";
import { FieldError } from "@/components/common/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AddTableFormData } from "@/types/add-table.type";

export const TableNameField = () => {
	const {
		control,
		register,
		formState: { errors },
	} = useFormContext<AddTableFormData>();

	return (
		<Controller
			control={control}
			name="tableName"
			render={() => (
				<div className="flex gap-24">
					<Label htmlFor="tableName">Table Name</Label>
					<div className="flex-1 space-y-1">
						<Input
							id="tableName"
							{...register("tableName", { required: "Table name is required" })}
							className={
								errors.tableName ? "border-destructive ring-destructive ring-1" : ""
							}
						/>
						<FieldError error={errors.tableName?.message} />
					</div>
				</div>
			)}
		/>
	);
};
