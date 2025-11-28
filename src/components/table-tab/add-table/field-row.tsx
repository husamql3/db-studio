import { XIcon } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import type { AddTableFormData } from "@/types/add-table.type";
import { AdvancedOptions } from "./advanced-options";
import { ColumnNameField } from "./column-name-field";
import { ColumnTypeField } from "./column-type-field";
import { DefaultValueField } from "./default-value-field";
import { PrimaryField } from "./primary-field";

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
				{!isPrimaryKey && <AdvancedOptions index={index} />}

				{/* Remove Button */}
				<div className="flex items-end justify-center">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-9"
						onClick={onRemove}
						disabled={!canRemove}
					>
						<XIcon className="h-4 w-4" />
					</Button>
				</div>
			</div>
		</div>
	);
};
