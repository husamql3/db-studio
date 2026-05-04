import { Input } from "@db-studio/ui/input";
import { Controller, useFormContext } from "react-hook-form";
import type { AddTableFormData } from "@/types/add-table.type";

export const DefaultValueField = ({
	index,
	isRequired = true,
}: {
	index: number;
	isRequired?: boolean;
}) => {
	const {
		control,
		register,
		formState: { errors },
	} = useFormContext<AddTableFormData>();

	return (
		<Controller
			control={control}
			name={`fields.${index}.defaultValue`}
			render={() => (
				<div className="flex flex-col gap-2">
					<Input
						id={`fields.${index}.defaultValue`}
						{...register(
							`fields.${index}.defaultValue`,
							isRequired
								? {
										required: "Default value is required",
									}
								: undefined,
						)}
						placeholder="NULL"
						className={
							errors?.fields?.[index]?.defaultValue
								? "border-destructive ring-destructive ring-1"
								: ""
						}
					/>
				</div>
			)}
		/>
	);
};
