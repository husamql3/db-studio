import { XIcon } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import type { AddTableFormData } from "shared/types";
import { AddForeignKeyForm } from "@/components/add-table/add-foreign-key/add-foreign-key-form";
import { AdvancedOptions } from "@/components/add-table/add-record/advanced-options";
import { ColumnNameField } from "@/components/add-table/add-record/column-name-field";
import { ColumnTypeField } from "@/components/add-table/add-record/column-type-field";
import { DefaultValueField } from "@/components/add-table/add-record/default-value-field";
import { PrimaryField } from "@/components/add-table/add-record/primary-field";
import { Button } from "@/components/ui/button";

export const FieldRow = ({
	index,
	onRemove,
	canRemove,
}: {
	index: number;
	onRemove: () => void;
	canRemove: boolean;
}) => {
	const { control } = useFormContext<AddTableFormData>();
	const isPrimaryKey = useWatch({
		control,
		name: `fields.${index}.isPrimaryKey`,
	});

	return (
		<div className="grid grid-cols-4 gap-4">
			<ColumnNameField index={index} />
			<ColumnTypeField index={index} />
			<DefaultValueField index={index} />

			<div className="flex gap-2">
				<PrimaryField index={index} />
				<AdvancedOptions
					index={index}
					isDisabled={Boolean(isPrimaryKey)}
				/>

				{/* Remove Button */}
				<div className="flex items-end justify-center">
					<Button
						type="button"
						variant="ghost"
						className="size-9"
						onClick={onRemove}
						disabled={!canRemove}
					>
						<XIcon className="h-4 w-4" />
					</Button>
				</div>

				<AddForeignKeyForm index={index} />
			</div>
		</div>
	);
};
