import { useFieldArray, useFormContext } from "react-hook-form";
import { Sheet } from "@/components/components/sheet";
import { Button } from "@/components/ui/button";
import { useSheetStore } from "@/stores/sheet.store";
import type { AddTableFormData } from "@/types/add-table.type";
import { ForeignKeySelectorField } from "./foreign-key-selector-field";
import { ReferencedTableField } from "./referenced-table-field";

export const AddForeignKeyForm = ({ index }: { index: number }) => {
	const { closeSheet } = useSheetStore();
	const { control } = useFormContext<AddTableFormData>();

	// const { fields: fieldsData } = useFieldArray({
	// 	control,
	// 	name: "fields",
	// })
	// setValue(`foreignKeys.${index}.columnName`, fieldsData[index].columnName)

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
			title="Add foreign key relationship"
			name={`add-foreign-key-${index}`}
			width={500}
			onClose={() => {
				closeSheet(`add-foreign-key-${index}`);
			}}
		>
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
		</Sheet>
	);
};
