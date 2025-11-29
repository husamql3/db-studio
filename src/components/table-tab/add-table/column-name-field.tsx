import { LinkIcon } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { useSheetStore } from "@/stores/sheet.store";
import type { AddTableFormData } from "@/types/add-table.type";
import { cn } from "@/utils/cn";

export const ColumnNameField = ({ index }: { index: number }) => {
	const { openSheet } = useSheetStore();
	const {
		control,
		register,
		formState: { errors },
	} = useFormContext<AddTableFormData>();

	const handleGenerateColumnName = () => {
		openSheet("add-foreign-key");
	};

	return (
		<Controller
			control={control}
			name={`fields.${index}.columnName`}
			render={() => (
				<div className="flex">
					<Input
						id={`fields.${index}.columnName`}
						{...register(`fields.${index}.columnName`, {
							required: "Column name is required",
						})}
						placeholder="column_name"
						className={cn(
							"-me-px flex-1 rounded-e-none shadow-none focus-visible:z-10",
							errors?.fields?.[index]?.columnName
								? "border-destructive ring-destructive ring-1"
								: "",
						)}
					/>
					<button
						aria-label="Generate column name"
						className="inline-flex w-9 items-center justify-center rounded-e-md border border-dashed border-input bg-background text-muted-foreground/80 text-sm outline-none transition-[color,box-shadow] hover:bg-accent hover:text-accent-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
						type="button"
						onClick={handleGenerateColumnName}
					>
						<LinkIcon
							aria-hidden="true"
							size={16}
						/>
					</button>
				</div>
			)}
		/>
	);
};
