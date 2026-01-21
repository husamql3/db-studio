import { useFieldArray, useFormContext } from "react-hook-form";
import type { AddTableFormData } from "shared/types";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useSheetStore } from "@/stores/sheet.store";
import { ForeignKeySelectorField } from "./foreign-key-selector-field";
import { ReferencedTableField } from "./referenced-table-field";

export const AddForeignKeyForm = ({ index }: { index: number }) => {
	const { closeSheet, isSheetOpen } = useSheetStore();
	const { control } = useFormContext<AddTableFormData>();

	// Add useFieldArray to manage the array properly
	const { remove: removeForeignKeys } = useFieldArray({
		control,
		name: "foreignKeys",
	});

	const resetForeignKey = () => {
		// Remove the item from the array instead of setting to undefined
		removeForeignKeys(index);
		closeSheet(`add-foreign-key-${index}`);
	};

	return (
		<Sheet
			open={isSheetOpen(`add-foreign-key-${index}`)}
			onOpenChange={(open) => {
				if (!open) {
					closeSheet(`add-foreign-key-${index}`);
				}
			}}
		>
			<SheetContent className="max-w-lg!">
				<SheetHeader>
					<SheetTitle>Add foreign key relationship</SheetTitle>
				</SheetHeader>
				<div className="flex flex-col justify-between px-5 py-6 h-full flex-1">
					<div className="space-y-6 flex-1">
						<ReferencedTableField index={index} />
						<ForeignKeySelectorField index={index} />
					</div>

					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={resetForeignKey}
					>
						<span className="text-xs">Reset Foreign Key</span>
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
};
