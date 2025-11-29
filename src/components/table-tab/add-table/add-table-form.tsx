import { zodResolver } from "@hookform/resolvers/zod";
import { type FieldErrors, FormProvider, useForm } from "react-hook-form";
import { Sheet } from "@/components/components/sheet";
import { useCreateTable } from "@/hooks/use-create-table";
import { useSheetStore } from "@/stores/sheet.store";
import { type AddTableFormData, addTableSchema } from "@/types/add-table.type";
import { FormActions } from "./form-actions";
import { FormContent } from "./form-content";
import { TableNameField } from "./table-name-field";

const defaultValues: AddTableFormData = {
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
} as const;

export const AddTableForm = () => {
	const { closeSheet } = useSheetStore();
	const { createTable, isCreatingTable } = useCreateTable();
	const methods = useForm({
		mode: "onSubmit",
		defaultValues,
		resolver: zodResolver(addTableSchema),
	});

	const onSubmit = (data: AddTableFormData) => {
		createTable(data);
		methods.reset();
	};

	const onError = (errors: FieldErrors<AddTableFormData>) => {
		console.log(errors);
		// todo: show errors in toast
	};

	const handleCancel = () => {
		methods.reset();
		closeSheet();
	};

	return (
		<Sheet title="Create a new table" name="add-table">
			<FormProvider {...methods}>
				<form
					onSubmit={methods.handleSubmit(onSubmit, onError)}
					className="px-5 py-6 space-y-6"
				>
					<TableNameField />
					<FormContent />
					<FormActions onCancel={handleCancel} isLoading={isCreatingTable} />
				</form>
			</FormProvider>
		</Sheet>
	);
};
