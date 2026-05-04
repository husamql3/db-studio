import { Controller, useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { AddTableFormData } from "@/types/add-table.type";
import { FOREIGN_KEY_ACTION_OPTIONS } from "@/utils/constants/add-table";

export const UpdateActionSelector = ({ index }: { index: number }) => {
	const { control } = useFormContext<AddTableFormData>();

	return (
		<Controller
			control={control}
			name={`foreignKeys.${index}.onUpdate`}
			defaultValue="NO ACTION"
			render={({ field }) => (
				<div className="flex flex-col gap-2">
					<Label htmlFor={`foreignKeys.${index}.onUpdate`}>
						Action if referenced row is updated
					</Label>
					<Select
						value={field.value}
						onValueChange={(value) => field.onChange(value)}
					>
						<SelectTrigger className="w-full flex-1">
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
