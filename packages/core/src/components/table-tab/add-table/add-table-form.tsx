import { zodResolver } from "@hookform/resolvers/zod";
import { type FieldErrors, FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Sheet } from "@/components/components/sheet";
import { useCreateTable } from "@/hooks/use-create-table";
import { useSheetStore } from "@/stores/sheet.store";
import { type AddTableFormData, addTableSchema } from "@/types/add-table.type";
import { FormActions } from "./form-actions";
import { FormContent } from "./form-content";
import { TableNameField } from "./table-name-field";

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

export const AddTableForm = () => {
	const { closeSheet } = useSheetStore();
	const { createTable, isCreatingTable } = useCreateTable();
	const methods = useForm({
		mode: "onSubmit",
		defaultValues,
		resolver: zodResolver(addTableSchema),
	});

	const onSubmit = async (data: AddTableFormData) => {
		console.log("onSubmit", data);

		// Filter out empty/invalid foreign keys (keep only null or fully populated ones)
		const cleanedData = {
			...data,
			foreignKeys: data.foreignKeys?.filter((fk) => {
				// Keep null entries or fully populated foreign keys
				if (fk === null) return true;
				return fk.columnName && fk.referencedTable && fk.referencedColumn;
			}),
		};

		try {
			await createTable(cleanedData);
		} catch (error) {
			console.error("Error creating table:", error);
		}
	};

	const onError = (errors: FieldErrors<AddTableFormData>) => {
		// Show the first validation error found
		if (errors.tableName?.message) {
			toast.error(errors.tableName.message);
			return;
		}

		// Check fields array for errors
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

		// Check foreignKeys array for errors
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

		// Fallback generic error
		toast.error("Please check the form for errors");
	};

	const handleCancel = () => {
		methods.reset();
		closeSheet();
	};

	console.log(methods.getValues());

	return (
		<Sheet
			title="Create a new table"
			name="add-table"
		>
			<FormProvider {...methods}>
				<form
					onSubmit={methods.handleSubmit(onSubmit, onError)}
					className="px-5 py-6 space-y-6"
				>
					<TableNameField />
					<FormContent />
					<FormActions
						onCancel={handleCancel}
						isLoading={isCreatingTable}
					/>
				</form>
			</FormProvider>
		</Sheet>
	);
};
