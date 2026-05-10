import { Button } from "@db-studio/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@db-studio/ui/sheet";
import { useFieldArray, useFormContext } from "react-hook-form";
import type { AddTableFormData } from "@/features/table-builder/types";
import { useOverlayStore } from "@/stores/overlay.store";
import { ForeignKeySelectorField } from "./foreign-key-selector-field";
import { ReferencedTableField } from "./referenced-table-field";

export const AddForeignKeyForm = ({ index }: { index: number }) => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();
	const { control } = useFormContext<AddTableFormData>();

	const { remove: removeForeignKeys } = useFieldArray({
		control,
		name: "foreignKeys",
	});

	const resetForeignKey = () => {
		removeForeignKeys(index);
		closeOverlay(`table-builder.add-foreign-key-${index}`);
	};

	return (
		<Sheet
			open={isOverlayOpen(`table-builder.add-foreign-key-${index}`)}
			onOpenChange={(open) => {
				if (!open) {
					closeOverlay(`table-builder.add-foreign-key-${index}`);
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
