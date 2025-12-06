import { useQuery } from "@tanstack/react-query";
import { type FieldErrors, FormProvider, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { type AddRecordFormData, useCreateRecord } from "@/hooks/use-create-record";
import { queries } from "@/providers/queries";
import { useActiveTableStore } from "@/stores/active-table.store";
import { useSheetStore } from "@/stores/sheet.store";
import { AddRecordField } from "./add-record-field";
import { RecordReferenceSheet } from "./record-reference-sheet";

// TODO: Add loading skeleton
// TODO: Add a dropdown for the primary key
// TODO: Add a dropdown for the foreign key
// TODO: Add a dropdown for the unique
// TODO: Add a dropdown for the identity
// TODO: Add a dropdown for the array
// TODO: Add a dropdown for the enum
// TODO: Add a dropdown for the boolean
// TODO: Add a dropdown for the dates

export const AddRecordForm = () => {
	const { closeSheet, isSheetOpen } = useSheetStore();
	const { activeTable } = useActiveTableStore();
	const { data: tableCols, isLoading: isLoadingTableCols } = useQuery(
		queries.tableCols(activeTable ?? ""),
	);
	const { createRecord, isCreatingRecord } = useCreateRecord();
	const methods = useForm();

	const onSubmit = async (data: AddRecordFormData) => {
		console.log(data);
		try {
			await createRecord(data);
			methods.reset();
		} catch (error) {
			console.error("Failed to create record:", error);
		}
	};

	const onError = (errors: FieldErrors<AddRecordFormData>) => {
		console.log(errors);
	};

	const handleCancel = () => {
		methods.reset();
		closeSheet("add-row");
	};
	console.log(tableCols);

	return (
		<Sheet
			open={isSheetOpen("add-row")}
			onOpenChange={(open) => {
				if (!open) {
					handleCancel();
				}
			}}
		>
			<SheetContent className="sm:max-w-2xl!">
				<SheetHeader>
					<SheetTitle>
						Add a new record to <span className="text-primary">{activeTable}</span> table
					</SheetTitle>
					<SheetDescription className="sr-only">
						Add a new record to the table: {activeTable}.
					</SheetDescription>
				</SheetHeader>

				<FormProvider {...methods}>
					<form
						onSubmit={methods.handleSubmit(onSubmit, onError)}
						className="flex-1 flex flex-col overflow-y-auto"
					>
						<div className="flex flex-col gap-6 py-6 px-4 overflow-y-auto">
							{tableCols && tableCols.length > 0 && !isLoadingTableCols
								? tableCols.map((col) => (
										<AddRecordField
											key={col.columnName}
											{...col}
										/>
									))
								: null}
						</div>

						<SheetFooter className="">
							<SheetClose
								asChild
								onClick={handleCancel}
								disabled={isCreatingRecord}
							>
								<Button variant="outline">Close</Button>
							</SheetClose>

							<Button
								type="submit"
								disabled={isCreatingRecord}
							>
								Save
							</Button>
						</SheetFooter>
					</form>

					{/* Record reference sheet */}
					<RecordReferenceSheet />
				</FormProvider>
			</SheetContent>
		</Sheet>
	);
};
