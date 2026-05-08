import { Alert } from "@db-studio/ui/alert";
import { Button } from "@db-studio/ui/button";
import { SheetClose } from "@db-studio/ui/sheet";
import { FormProvider, useForm } from "react-hook-form";
import { useTableCols } from "@/features/schema";
import { useOverlayStore } from "@/stores/overlay.store";
import { AddRecordField } from "./add-record-field";
import { RecordReferenceSheet } from "./record-reference-sheet";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { type AddRecordFormData, useCreateRecord } from "../hooks/use-create-record";

export const AddRecordForm = ({ tableName }: { tableName: string }) => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();
	const { tableCols, isLoadingTableCols } = useTableCols({ tableName });
	const { createRecord, isCreatingRecord } = useCreateRecord({ tableName });
	const methods = useForm<AddRecordFormData>();

	const onSubmit = async (data: AddRecordFormData) => {
		createRecord(data, {
			onSuccess: () => {
				methods.reset();
				closeOverlay("records.add-record");
			},
			onError: (error) => {
				console.error("Failed to create record:", error);
			},
		});
	};

	const handleCancel = () => {
		methods.reset();
		closeOverlay("records.add-record");
	};

	const renderFormContent = () => {
		if (tableCols && tableCols.length > 0) {
			return (
				<FormProvider {...methods}>
					<form
						onSubmit={methods.handleSubmit(onSubmit)}
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

					<RecordReferenceSheet />
				</FormProvider>
			);
		}

		return (
			<div className="flex flex-col h-full">
				<div className="space-y-6">
					<Alert
						variant="info"
						title="No columns found"
						message="Please add at least one column to the table before adding a record."
					/>
				</div>
			</div>
		);
	};

	return (
		<SheetSidebar
			title={`Add a new record to the table: ${tableName}`}
			open={isOverlayOpen("records.add-record")}
			onOpenChange={(open) => {
				if (!open) {
					handleCancel();
				}
			}}
		>
			{renderFormContent()}
		</SheetSidebar>
	);
};
