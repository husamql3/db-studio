import { Controller, useFormContext } from "react-hook-form";
import type { AddTableFormData } from "shared/types";
import { Input } from "@/components/ui/input";

export const DefaultValueField = ({ index }: { index: number }) => {
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
						{...register(`fields.${index}.defaultValue`, {
							required: "Default value is required",
						})}
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
