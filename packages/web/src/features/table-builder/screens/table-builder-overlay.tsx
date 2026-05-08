import { zodResolver } from "@hookform/resolvers/zod";
import { type FieldErrors, FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormActions } from "../components/fields/form-actions";
import { FormContent } from "../components/form-content";
import { TableNameField } from "../components/table-name-field";
import { useCreateTable } from "../hooks/use-create-table";
import { addTableSchema, type AddTableFormData } from "../types";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { useOverlayStore } from "@/stores/overlay.store";

const defaultValues = {
	tableName: "",
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
	foreignKeys: undefined,
} satisfies AddTableFormData;

export const TableBuilderOverlay = () => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();
	const { createTable, isCreatingTable } = useCreateTable();
	const methods = useForm({
		mode: "onSubmit",
		defaultValues,
		resolver: zodResolver(addTableSchema),
	});

	const onSubmit = async (data: AddTableFormData) => {
		const cleanedData = {
			...data,
			foreignKeys: data.foreignKeys?.filter((fk) => {
				if (fk === null) return true;
				return fk.columnName && fk.referencedTable && fk.referencedColumn;
			}),
		};

		try {
			await createTable(cleanedData, {
				onSuccess: () => {
					methods.reset();
				},
				onError: (error) => {
					console.error("Error creating table:", error);
				},
			});
		} catch (error) {
			console.error("Error creating table:", error);
		}
	};

	const onError = (errors: FieldErrors<AddTableFormData>) => {
		if (errors.tableName?.message) {
			toast.error(errors.tableName.message);
			return;
		}

		if (errors.fields && Array.isArray(errors.fields)) {
			for (const field of errors.fields) {
				if (field?.columnName?.message) {
					toast.error(field.columnName.message);
					return;
				}
				if (field?.columnType?.message) {
					toast.error(field.columnType.message);
					return;
				}
			}
		}

		if (errors.foreignKeys && Array.isArray(errors.foreignKeys)) {
			for (const fk of errors.foreignKeys) {
				if (fk?.columnName?.message) {
					toast.error(fk.columnName.message);
					return;
				}
				if (fk?.referencedTable?.message) {
					toast.error(fk.referencedTable.message);
					return;
				}
				if (fk?.referencedColumn?.message) {
					toast.error(fk.referencedColumn.message);
					return;
				}
			}
		}

		toast.error("Please check the form for errors");
	};

	const handleCancel = () => {
		methods.reset();
		closeOverlay("table-builder.create-table");
	};

	return (
		<SheetSidebar
			title="Create a new table"
			open={isOverlayOpen("table-builder.create-table")}
			onOpenChange={(open) => {
				if (!open) {
					handleCancel();
				}
			}}
		>
			<FormProvider {...methods}>
				<form
					onSubmit={methods.handleSubmit(onSubmit, onError)}
					className="space-y-6"
				>
					<TableNameField />
					<FormContent />
					<FormActions
						onCancel={handleCancel}
						isLoading={isCreatingTable}
					/>
				</form>
			</FormProvider>
		</SheetSidebar>
	);
};
