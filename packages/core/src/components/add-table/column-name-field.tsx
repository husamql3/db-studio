import { LinkIcon } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSheetStore } from "@/stores/sheet.store";
import type { AddTableFormData } from "@/types/add-table.type";

export const ColumnNameField = ({
	index,
	showForeignKeyButton = true,
}: {
	index: number;
	showForeignKeyButton?: boolean;
}) => {
	const { openSheet } = useSheetStore();
	const {
		control,
		register,
		formState: { errors },
		watch,
	} = useFormContext<AddTableFormData>();

	const referencedTable = showForeignKeyButton
		? watch(`foreignKeys.${index}.referencedTable`)
		: undefined;

	const handleGenerateColumnName = () => {
		// Just open the sheet - don't create empty foreign key entry
		openSheet(`add-foreign-key-${index}`);
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
							showForeignKeyButton
								? "-me-px flex-1 rounded-e-none shadow-none focus-visible:z-10"
								: "flex-1",
							errors?.fields?.[index]?.columnName
								? "border-destructive ring-destructive ring-1"
								: "",
						)}
					/>
					{showForeignKeyButton && (
						<button
							aria-label="Generate column name"
							className={cn(
								"inline-flex w-7 h-7 items-center justify-center rounded-e-md border border-input bg-background text-muted-foreground/80 text-sm outline-none transition-[color,box-shadow] hover:text-accent-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
								!referencedTable ? "border-dashed" : "",
							)}
							type="button"
							onClick={handleGenerateColumnName}
						>
							<LinkIcon
								aria-hidden="true"
								className="size-3"
							/>
						</button>
					)}
				</div>
			)}
		/>
	);
};
