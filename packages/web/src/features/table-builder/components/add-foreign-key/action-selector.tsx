import { Label } from "@db-studio/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { Controller, useFormContext } from "react-hook-form";
import type { AddTableFormData } from "@/features/table-builder/types";
import { FOREIGN_KEY_ACTION_OPTIONS } from "../../constants";

const ACTION_LABELS = {
	onUpdate: "Action if referenced row is updated",
	onDelete: "Action if referenced row is deleted",
};

export const ActionSelector = ({
	index,
	action,
}: {
	index: number;
	action: keyof typeof ACTION_LABELS;
}) => {
	const { control } = useFormContext<AddTableFormData>();
	const name = `fields.${index}.foreignKey.${action}` as const;

	return (
		<Controller
			control={control}
			name={name}
			defaultValue="NO ACTION"
			render={({ field }) => (
				<div className="flex flex-col gap-2">
					<Label htmlFor={name}>{ACTION_LABELS[action]}</Label>
					<Select
						value={field.value}
						onValueChange={field.onChange}
					>
						<SelectTrigger
							id={name}
							className="w-full flex-1"
						>
							<SelectValue placeholder="Select an action" />
						</SelectTrigger>
						<SelectContent>
							{FOREIGN_KEY_ACTION_OPTIONS.map((option) => (
								<SelectItem
									key={option.value}
									value={option.value}
								>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}
		/>
	);
};
