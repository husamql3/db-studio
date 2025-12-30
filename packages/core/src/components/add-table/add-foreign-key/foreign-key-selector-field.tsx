import { ArrowRight } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { Label } from "@/components/ui/label";
import type { AddTableFormData } from "@/types/add-table.type";
import { ColNameField } from "./col-name-field";
import { ReferencedColField } from "./referenced-col-field";
import { RemoveActionSelector } from "./remove-action-selector";
import { UpdateActionSelector } from "./update-action-selector";

// todo: add data types

export const ForeignKeySelectorField = ({ index }: { index: number }) => {
	const { control, watch } = useFormContext<AddTableFormData>();
	const referencedTable = watch(`foreignKeys.${index}.referencedTable`);

	const foreignKeyData = useWatch({
		control,
		name: `foreignKeys.${index}`,
	});

	if (!referencedTable || !foreignKeyData) return null;

	return (
		<div className="flex flex-col gap-4">
			<p className="text-xs text-muted-foreground">
				Select columns from{" "}
				<span className="font-mono text-primary">
					{foreignKeyData.referencedTable || "Unnamed table"}
				</span>{" "}
				to reference to
			</p>

			<div className="space-y-2">
				<div className="grid grid-cols-2 gap-2">
					<Label htmlFor={`foreignKeys.${index}.columnName`}>
						{watch("tableName") || "Unnamed table"}
					</Label>

					<Label htmlFor={`foreignKeys.${index}.referencedColumn`}>
						{foreignKeyData.referencedTable || "Unnamed table"}
					</Label>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<div className="flex items-center gap-2 flex-1">
						<ColNameField index={index} />
						<ArrowRight className="size-4 aspect-square text-muted-foreground" />
					</div>

					<div className="flex items-center gap-2 flex-1">
						<ReferencedColField index={index} />
					</div>
				</div>

				<hr className="my-8 border-zinc-800" />

				<div className="flex flex-col gap-6">
					<UpdateActionSelector index={index} />
					<RemoveActionSelector index={index} />
				</div>
			</div>
		</div>
	);
};
