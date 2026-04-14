import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { alterColumnSchema, type ColumnInfoSchemaType } from "shared/types";
import { z } from "zod";
import { ColumnTypeField } from "@/components/add-table/column-type-field";
import { DefaultValueField } from "@/components/add-table/default-value-field";
import { FormActions } from "@/components/add-table/form-actions";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAlterColumn } from "@/hooks/use-alter-column";
import { useSchemaEditStore } from "@/stores/schema-edit.store";
import { useSheetStore } from "@/stores/sheet.store";

const editColumnFormSchema = z.object({
	fields: z.tuple([
		z.object({
			columnName: z.string(),
			columnType: alterColumnSchema.shape.columnType,
			defaultValue: z.string(),
			isPrimaryKey: z.boolean(),
			isNullable: alterColumnSchema.shape.isNullable,
			isUnique: z.boolean(),
			isIdentity: z.boolean(),
			isArray: z.boolean(),
		}),
	]),
});

type EditColumnFormValues = z.infer<typeof editColumnFormSchema>;

const getDefaultValues = (column: ColumnInfoSchemaType | null): EditColumnFormValues => ({
	fields: [
		{
			columnName: column?.columnName ?? "",
			columnType: column?.dataTypeLabel ?? "",
			defaultValue: column?.columnDefault ?? "",
			isPrimaryKey: false,
			isNullable: column?.isNullable ?? true,
			isUnique: false,
			isIdentity: false,
			isArray: column?.dataType === "array",
		},
	],
});

export const EditColumnForm = ({ tableName }: { tableName: string }) => {
	const { closeSheet, isSheetOpen } = useSheetStore();
	const { editingColumn, setEditingColumn } = useSchemaEditStore();
	const methods = useForm<EditColumnFormValues>({
		mode: "onSubmit",
		defaultValues: getDefaultValues(null),
		resolver: zodResolver(editColumnFormSchema),
	});
	const { alterColumn, isAlteringColumn } = useAlterColumn({
		tableName,
		columnName: editingColumn?.columnName ?? "",
	});

	useEffect(() => {
		methods.reset(getDefaultValues(editingColumn));
	}, [editingColumn, methods]);

	const handleCancel = () => {
		setEditingColumn(null);
		methods.reset(getDefaultValues(null));
		closeSheet("edit-column");
	};

	const handleSubmit = async (data: EditColumnFormValues) => {
		await alterColumn({
			columnType: data.fields[0].columnType,
			isNullable: data.fields[0].isNullable,
			defaultValue: data.fields[0].defaultValue,
		});
		methods.reset(getDefaultValues(null));
	};

	return (
		<SheetSidebar
			title={editingColumn ? `Edit ${editingColumn.columnName}` : "Edit column"}
			description={
				editingColumn
					? `Update the type, nullability, and default value for "${editingColumn.columnName}".`
					: "Update the selected column."
			}
			open={isSheetOpen("edit-column")}
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
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="edit-column-name">Column name</Label>
							<Input
								id="edit-column-name"
								value={editingColumn?.columnName ?? ""}
								readOnly
								disabled
							/>
						</div>

						<div className="space-y-2">
							<Label>Column type</Label>
							<ColumnTypeField index={0} />
						</div>

						<div className="space-y-2">
							<Label>Default value</Label>
							<DefaultValueField
								index={0}
								isRequired={false}
							/>
						</div>

						<Controller
							control={methods.control}
							name="fields.0.isNullable"
							render={({ field }) => (
								<div className="flex items-center gap-3 rounded-lg border border-zinc-800 px-3 py-3">
									<Checkbox
										id="edit-column-nullable"
										checked={Boolean(field.value)}
										onCheckedChange={(checked) => field.onChange(checked === true)}
									/>
									<div className="space-y-1">
										<Label
											htmlFor="edit-column-nullable"
											className="cursor-pointer"
										>
											Nullable
										</Label>
										<p className="text-xs text-muted-foreground">
											Allow this column to store NULL values.
										</p>
									</div>
								</div>
							)}
						/>
					</div>

					<FormActions
						onCancel={handleCancel}
						isLoading={isAlteringColumn}
					/>
				</form>
			</FormProvider>
		</SheetSidebar>
	);
};
