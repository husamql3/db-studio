import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AddTableFormData } from "@/types/add-table.type";
import { FieldRow } from "./field-row";

export const FormContent = () => {
	const { control } = useFormContext<AddTableFormData>();

	const { fields, append, remove } = useFieldArray({
		control,
		name: "fields",
	});

	// Watch all isPrimaryKey values reactively
	const watchedFields = useWatch({
		control,
		name: "fields",
	});

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
		}
	};
	// Group fields by primary key status
	const primaryFields = fields
	.map((field, index) => ({ field, index }))
	.filter(({ index }) => watchedFields?.[index]?.isPrimaryKey);
	
	const nonPrimaryFields = fields
	.map((field, index) => ({ field, index }))
	.filter(({ index }) => !watchedFields?.[index]?.isPrimaryKey);
	
	// TODO: Composite primary key selected label
	
	return (
		<div className="space-y-2">
			<div className="grid grid-cols-4 px-2">
				<Label className="text-xs">Column Name</Label>
				<Label className="text-xs">Column Type</Label>
				<Label className="text-xs">Default Value</Label>
				<Label className="text-xs">Primary</Label>
			</div>

			<div className="space-y-2">
				{/* Primary Key Fields */}
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

				{/* Non-Primary Key Fields */}
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
