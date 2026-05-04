import { addColumnSchema } from "@db-studio/shared/types";
import { Label } from "@db-studio/ui/label";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";
import { AdvancedOptions } from "@/components/add-table/advanced-options";
import { ColumnNameField } from "@/components/add-table/column-name-field";
import { ColumnTypeField } from "@/components/add-table/column-type-field";
import { DefaultValueField } from "@/components/add-table/default-value-field";
import { FormActions } from "@/components/add-table/form-actions";
import { PrimaryField } from "@/components/add-table/primary-field";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { useAddColumn } from "@/hooks/use-add-column";
import { useSheetStore } from "@/stores/sheet.store";

const addColumnFormSchema = z.object({
	fields: z.tuple([
		z.object({
			columnName: addColumnSchema.shape.columnName,
			columnType: addColumnSchema.shape.columnType,
			defaultValue: z.string(),
			isPrimaryKey: z.boolean(),
			isNullable: z.boolean(),
			isUnique: z.boolean(),
			isIdentity: z.boolean(),
			isArray: z.boolean(),
		}),
	]),
});

type AddColumnFormValues = z.infer<typeof addColumnFormSchema>;

const defaultValues: AddColumnFormValues = {
	fields: [
		{
			columnName: "",
			columnType: "",
			defaultValue: "",
			isPrimaryKey: false,
			isNullable: true,
			isUnique: false,
			isIdentity: false,
			isArray: false,
		},
	],
};

const AddColumnFormContent = () => {
	const methods = useFormContext<AddColumnFormValues>();
	const isPrimaryKey = useWatch({
		control: methods.control,
		name: "fields.0.isPrimaryKey",
	});

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
						index={0}
						showForeignKeyButton={false}
					/>
					<ColumnTypeField index={0} />
					<DefaultValueField
						index={0}
						isRequired={false}
					/>
					<div className="flex gap-2">
						<PrimaryField index={0} />
						<AdvancedOptions
							index={0}
							isDisabled={Boolean(isPrimaryKey)}
						/>
					</div>
				</div>
			</div>
		</div>
	);
};

export const AddColumnForm = ({ tableName }: { tableName: string }) => {
	const { closeSheet, isSheetOpen } = useSheetStore();
	const { addColumn, isAddingColumn } = useAddColumn({ tableName });

	const methods = useForm<AddColumnFormValues>({
		mode: "onSubmit",
		defaultValues,
		resolver: zodResolver(addColumnFormSchema),
	});

	const handleCancel = () => {
		methods.reset(defaultValues);
		closeSheet("add-column");
	};

	const handleSubmit = async (data: AddColumnFormValues) => {
		await addColumn(data.fields[0]);
		methods.reset(defaultValues);
	};

	return (
		<SheetSidebar
			title="Add column"
			description={`Add a new column to "${tableName}".`}
			open={isSheetOpen("add-column")}
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
