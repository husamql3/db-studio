import { type FieldErrors, FormProvider, useForm } from "react-hook-form";
import { AddRecordField } from "@/components/add-table/add-record/add-record-field";
import { RecordReferenceSheet } from "@/components/add-table/add-record/record-reference-sheet";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { type AddRecordFormData, useCreateRecord } from "@/hooks/use-create-record";
import { useTableCols } from "@/hooks/use-table-cols";
import { useSheetStore } from "@/stores/sheet.store";

export const AddRecordForm = ({ tableName }: { tableName: string }) => {
	const { closeSheet, isSheetOpen } = useSheetStore();
	const { tableCols, isLoadingTableCols } = useTableCols({ tableName });
	const { createRecord, isCreatingRecord } = useCreateRecord({ tableName });
	const methods = useForm<AddRecordFormData>();

	const onSubmit = async (data: AddRecordFormData) => {
		console.log("onSubmit", data);
		createRecord(data, {
			onSuccess: () => {
				methods.reset();
				closeSheet("add-record");
			},
			onError: (error) => {
				console.error("Failed to create record:", error);
			},
		});
	};

	const onError = (errors: FieldErrors<AddRecordFormData>) => {
		console.log("onError", errors);
	};

	const handleCancel = () => {
		methods.reset();
		closeSheet("add-record");
	};
	console.log("tableCols", tableCols);

	return (
		<SheetSidebar
			title={`Add a new record to the table: ${tableName}`}
			open={isSheetOpen("add-record")}
			onOpenChange={(open) => {
				if (!open) {
					handleCancel();
				}
			}}
		>
			<FormProvider {...methods}>
				<form
					onSubmit={methods.handleSubmit(onSubmit, onError)}
					className="flex flex-col h-full"
				>
					<div className="space-y-6">
						{tableCols && tableCols.length > 0 && !isLoadingTableCols
							? tableCols.map((col) => (
									<AddRecordField
										key={col.columnName}
										{...col}
									/>
								))
							: null}
					</div>

					<div className="flex justify-end gap-2 py-6">
						<SheetClose
							asChild
							onClick={handleCancel}
							disabled={isCreatingRecord}
						>
							<Button
								variant="outline"
								size="lg"
							>
								Close
							</Button>
						</SheetClose>

						<Button
							type="submit"
							size="lg"
							disabled={isCreatingRecord || !methods.formState.isDirty}
						>
							Save
						</Button>
					</div>
				</form>

				{/* Record reference sheet */}
				<RecordReferenceSheet />
			</FormProvider>
		</SheetSidebar>
	);
};
