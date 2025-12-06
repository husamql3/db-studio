import { Controller, useFormContext } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import type { AddTableFormData } from "@/types/add-table.type";

export const PrimaryField = ({ index }: { index: number }) => {
	const { watch, control, register, setValue } = useFormContext<AddTableFormData>();
	const isPrimaryKey = watch(`fields.${index}.isPrimaryKey`);
	return (
		<Controller
			control={control}
			name={`fields.${index}.isPrimaryKey`}
			render={() => (
				<div className="flex flex-1 items-center justify-start">
					<Checkbox
						id={`fields.${index}.isPrimaryKey`}
						{...register(`fields.${index}.isPrimaryKey`)}
						onCheckedChange={(checked) => {
							setValue(`fields.${index}.isPrimaryKey`, Boolean(checked));
							setValue(`fields.${index}.isNullable`, false);
						}}
						checked={isPrimaryKey}
						className="size-5"
					/>
				</div>
			)}
		/>
	);
};
