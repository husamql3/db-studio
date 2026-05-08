import { Button } from "@db-studio/ui/button";
import { XIcon } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { AddForeignKeyForm } from "./add-foreign-key/add-foreign-key-form";
import { AdvancedOptions } from "./fields/advanced-options";
import { ColumnNameField } from "./fields/column-name-field";
import { ColumnTypeField } from "./fields/column-type-field";
import { DefaultValueField } from "./fields/default-value-field";
import { PrimaryField } from "./fields/primary-field";
import type { AddTableFormData } from "@/features/table-builder/types";

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
