import { Alert } from "@db-studio/ui/alert";
import { Button } from "@db-studio/ui/button";
import { Label } from "@db-studio/ui/label";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import type { AddTableFormData } from "@/features/table-builder/types";
import { FieldRow } from "./field-row";

export const FormContent = () => {
	const { control } = useFormContext<AddTableFormData>();

	const { fields, append, remove } = useFieldArray({ control, name: "fields" });
	const { remove: removeForeignKeys } = useFieldArray({ control, name: "foreignKeys" });

	const watchedFields = useWatch({ control, name: "fields" });

	const addField = () => {
		append({
			columnName: "",
			columnType: "",
			defaultValue: "",
			isPrimaryKey: false,
			isNullable: true,
			isUnique: false,
			isIdentity: false,
			isArray: false,
		});
	};

	const removeField = (index: number) => {
		if (fields.length > 1) {
			remove(index);
			removeForeignKeys(index);
		}
	};

	const primaryFields = fields.reduce<{ field: (typeof fields)[number]; index: number }[]>(
		(acc, field, index) => {
			if (watchedFields?.[index]?.isPrimaryKey) acc.push({ field, index });
			return acc;
		},
		[],
	);

	const nonPrimaryFields = fields.reduce<{ field: (typeof fields)[number]; index: number }[]>(
		(acc, field, index) => {
			if (!watchedFields?.[index]?.isPrimaryKey) acc.push({ field, index });
			return acc;
		},
		[],
	);

	return (
		<div className="space-y-2">
			{primaryFields.length > 1 && (
				<Alert
					variant="info"
					title="Composite primary key selected"
					className="mb-6"
				/>
			)}

			<div className="grid grid-cols-4 px-2">
				<Label className="text-xs">Column Name</Label>
				<Label className="text-xs">Column Type</Label>
				<Label className="text-xs">Default Value</Label>
				<Label className="text-xs">Primary</Label>
			</div>

			<div className="space-y-2">
				{primaryFields.length > 0 && (
					<div className="bg-primary/10 rounded-lg px-2 py-3 space-y-2">
						{primaryFields.map(({ field, index }) => (
							<FieldRow
								key={field.id}
								index={index}
								onRemove={() => removeField(index)}
								canRemove={fields.length > 1}
							/>
						))}
					</div>
				)}

				{nonPrimaryFields.length > 0 && (
					<div className="space-y-2 px-2 py-3">
						{nonPrimaryFields.map(({ field, index }) => (
							<FieldRow
								key={field.id}
								index={index}
								onRemove={() => removeField(index)}
								canRemove={fields.length > 1}
							/>
						))}
					</div>
				)}
			</div>

			<div className="border border-dashed border-input rounded-lg flex justify-center items-center p-6">
				<Button
					type="button"
					variant="secondary"
					size="sm"
					onClick={addField}
				>
					Add New Column
				</Button>
			</div>
		</div>
	);
};
