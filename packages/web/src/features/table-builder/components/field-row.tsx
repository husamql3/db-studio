import { Button } from "@db-studio/ui/button";
import { cn } from "@db-studio/ui/utils";
import { LinkIcon, XIcon } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import {
	AdvancedOptions,
	ColumnNameField,
	ColumnTypeField,
	DefaultValueField,
	PrimaryField,
} from "@/features/schema";
import type { AddTableFormData } from "@/features/table-builder/types";
import { useOverlayStore } from "@/stores/overlay.store";
import { AddForeignKeyForm } from "./add-foreign-key/add-foreign-key-form";

export const FieldRow = ({
	index,
	onRemove,
	canRemove,
}: {
	index: number;
	onRemove: () => void;
	canRemove: boolean;
}) => {
	const { openOverlay } = useOverlayStore();

	const {
		control,
		register,
		setValue,
		formState: { errors },
	} = useFormContext<AddTableFormData>();

	const values = useWatch({ control, name: `fields.${index}` });
	const referencedTable = useWatch({ control, name: `foreignKeys.${index}.referencedTable` });

	return (
		<div className="grid grid-cols-4 gap-4">
			<div className="flex">
				<ColumnNameField
					id={`fields.${index}.columnName`}
					{...register(`fields.${index}.columnName`)}
					invalid={Boolean(errors.fields?.[index]?.columnName)}
					className="-me-px rounded-e-none shadow-none focus-visible:z-10"
				/>
				<button
					aria-label="Generate column name"
					className={cn(
						"inline-flex w-7 h-7 items-center justify-center rounded-e-md border border-input bg-background text-muted-foreground/80 text-sm outline-none transition-[color,box-shadow] hover:text-accent-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
						!referencedTable ? "border-dashed" : "",
					)}
					type="button"
					onClick={() => openOverlay(`table-builder.add-foreign-key-${index}`)}
				>
					<LinkIcon
						aria-hidden="true"
						className="size-3"
					/>
				</button>
			</div>
			<ColumnTypeField
				control={control}
				name={`fields.${index}.columnType`}
				onIncompatibleOptions={(options) => {
					for (const option of options) setValue(`fields.${index}.${option}`, false);
				}}
			/>
			<DefaultValueField
				id={`fields.${index}.defaultValue`}
				{...register(`fields.${index}.defaultValue`)}
				invalid={Boolean(errors.fields?.[index]?.defaultValue)}
			/>

			<div className="flex gap-2">
				<PrimaryField
					id={`fields.${index}.isPrimaryKey`}
					checked={values.isPrimaryKey}
					onCheckedChange={(checked) => {
						setValue(`fields.${index}.isPrimaryKey`, checked);
						setValue(`fields.${index}.isNullable`, false);
					}}
				/>
				<AdvancedOptions
					idPrefix={String(index)}
					values={values}
					onChange={(option, checked) => setValue(`fields.${index}.${option}`, checked)}
				/>

				<div className="flex items-end justify-center">
					<Button
						type="button"
						variant="ghost"
						className="size-9"
						onClick={onRemove}
						disabled={!canRemove}
					>
						<XIcon className="size-4" />
					</Button>
				</div>

				<AddForeignKeyForm index={index} />
			</div>
		</div>
	);
};
