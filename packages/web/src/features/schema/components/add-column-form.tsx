import { Label } from "@db-studio/ui/label";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { useOverlayStore } from "@/stores/overlay.store";
import { useAddColumn } from "../hooks/use-add-column";
import { AdvancedOptions } from "./column-fields/advanced-options";
import {
	type ColumnFieldValues,
	columnFieldSchema,
	DEFAULT_COLUMN_FIELD,
} from "./column-fields/column-field-values";
import { ColumnNameField } from "./column-fields/column-name-field";
import { ColumnTypeField } from "./column-fields/column-type-field";
import { DefaultValueField } from "./column-fields/default-value-field";
import { FormActions } from "./column-fields/form-actions";
import { PrimaryField } from "./column-fields/primary-field";

const AddColumnFormContent = () => {
	const {
		control,
		register,
		setValue,
		watch,
		formState: { errors },
	} = useFormContext<ColumnFieldValues>();

	const values = watch();

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-4 px-2">
				<Label className="text-xs">Column Name</Label>
				<Label className="text-xs">Column Type</Label>
				<Label className="text-xs">Default Value</Label>
				<Label className="text-xs">Primary</Label>
			</div>

			<div className="px-2 py-3">
				<div className="grid grid-cols-4 gap-4">
					<ColumnNameField
						id="columnName"
						{...register("columnName")}
						invalid={Boolean(errors.columnName)}
					/>
					<ColumnTypeField
						control={control}
						name="columnType"
						onIncompatibleOptions={(options) => {
							for (const option of options) setValue(option, false);
						}}
					/>
					<DefaultValueField
						id="defaultValue"
						{...register("defaultValue")}
						invalid={Boolean(errors.defaultValue)}
					/>
					<div className="flex gap-2">
						<PrimaryField
							id="isPrimaryKey"
							checked={values.isPrimaryKey}
							onCheckedChange={(checked) => {
								setValue("isPrimaryKey", checked);
								setValue("isNullable", false);
							}}
						/>
						<AdvancedOptions
							idPrefix="0"
							values={values}
							onChange={(option, checked) => setValue(option, checked)}
						/>
					</div>
				</div>
			</div>
		</div>
	);
};

export const AddColumnForm = ({ tableName }: { tableName: string }) => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();

	const { addColumn, isAddingColumn } = useAddColumn({
		tableName,
		schemaName: useTableSchemaName(),
	});

	const methods = useForm<ColumnFieldValues>({
		mode: "onSubmit",
		defaultValues: DEFAULT_COLUMN_FIELD,
		resolver: zodResolver(columnFieldSchema),
	});

	const handleCancel = () => {
		methods.reset(DEFAULT_COLUMN_FIELD);
		closeOverlay("schema.add-column");
	};

	const handleSubmit = async (data: ColumnFieldValues) => {
		await addColumn(data);
		methods.reset(DEFAULT_COLUMN_FIELD);
	};

	return (
		<SheetSidebar
			title="Add column"
			description={`Add a new column to "${tableName}".`}
			open={isOverlayOpen("schema.add-column")}
			onOpenChange={(open) => {
				if (!open) {
					handleCancel();
				}
			}}
		>
			<FormProvider {...methods}>
				<form
					onSubmit={methods.handleSubmit(handleSubmit)}
					className="space-y-6"
				>
					<AddColumnFormContent />
					<FormActions
						onCancel={handleCancel}
						isLoading={isAddingColumn}
					/>
				</form>
			</FormProvider>
		</SheetSidebar>
	);
};
