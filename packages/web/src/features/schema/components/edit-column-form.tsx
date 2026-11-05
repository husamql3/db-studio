import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { Checkbox } from "@db-studio/ui/checkbox";
import { Input } from "@db-studio/ui/input";
import { Label } from "@db-studio/ui/label";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { z } from "zod";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { useOverlayStore } from "@/stores/overlay.store";
import { useAlterColumn } from "../hooks/use-alter-column";
import { useSchemaEditStore } from "../stores/schema-edit.store";
import { columnFieldSchema } from "./column-fields/column-field-values";
import { ColumnTypeField } from "./column-fields/column-type-field";
import { DefaultValueField } from "./column-fields/default-value-field";
import { FormActions } from "./column-fields/form-actions";

const editColumnFormSchema = columnFieldSchema.pick({
	columnType: true,
	defaultValue: true,
	isNullable: true,
});

type EditColumnFormValues = z.infer<typeof editColumnFormSchema>;

const getDefaultValues = (column: ColumnInfoSchemaType | null): EditColumnFormValues => ({
	columnType: column?.dataTypeLabel ?? "",
	defaultValue: column?.columnDefault ?? "",
	isNullable: column?.isNullable ?? true,
});

export const EditColumnForm = ({ tableName }: { tableName: string }) => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();
	const { editingColumn, setEditingColumn } = useSchemaEditStore();

	const methods = useForm<EditColumnFormValues>({
		mode: "onSubmit",
		defaultValues: getDefaultValues(null),
		resolver: zodResolver(editColumnFormSchema),
	});

	const { alterColumn, isAlteringColumn } = useAlterColumn({
		tableName,
		schemaName: useTableSchemaName(),
		columnName: editingColumn?.columnName ?? "",
	});

	useEffect(() => {
		methods.reset(getDefaultValues(editingColumn));
	}, [editingColumn, methods]);

	const handleCancel = () => {
		setEditingColumn(null);
		methods.reset(getDefaultValues(null));
		closeOverlay("schema.edit-column");
	};

	const handleSubmit = async (data: EditColumnFormValues) => {
		await alterColumn(data);
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
			open={isOverlayOpen("schema.edit-column")}
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
							<ColumnTypeField
								control={methods.control}
								name="columnType"
							/>
						</div>

						<div className="space-y-2">
							<Label>Default value</Label>
							<DefaultValueField
								id="defaultValue"
								{...methods.register("defaultValue")}
								invalid={Boolean(methods.formState.errors.defaultValue)}
							/>
						</div>

						<Controller
							control={methods.control}
							name="isNullable"
							render={({ field }) => (
								<div className="flex items-center gap-3 rounded-lg border border-border p-3">
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
