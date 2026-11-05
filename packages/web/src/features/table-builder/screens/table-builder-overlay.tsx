import { zodResolver } from "@hookform/resolvers/zod";
import { type FieldErrors, FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { DEFAULT_COLUMN_FIELD, FormActions } from "@/features/schema";
import { useOverlayStore } from "@/stores/overlay.store";
import { FormContent } from "../components/form-content";
import { TableNameField } from "../components/table-name-field";
import { useCreateTable } from "../hooks/use-create-table";
import { type AddTableFormData, addTableSchema, toCreateTablePayload } from "../types";

const defaultValues = {
	tableName: "",
	fields: [DEFAULT_COLUMN_FIELD],
} satisfies AddTableFormData;

export const TableBuilderOverlay = () => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();
	const { createTable, isCreatingTable } = useCreateTable();

	const methods = useForm({
		mode: "onSubmit",
		defaultValues,
		resolver: zodResolver(addTableSchema),
	});

	const onSubmit = (data: AddTableFormData) =>
		createTable(toCreateTablePayload(data), { onSuccess: () => methods.reset() });

	const onError = (errors: FieldErrors<AddTableFormData>) => {
		const fieldMessage = (Array.isArray(errors.fields) ? errors.fields : [])
			.map((field) => field?.columnName?.message ?? field?.columnType?.message)
			.find(Boolean);

		toast.error(
			errors.tableName?.message ?? fieldMessage ?? "Please check the form for errors",
		);
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
