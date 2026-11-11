import { Label } from "@db-studio/ui/label";
import { ArrowRight } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import type { AddTableFormData } from "@/features/table-builder/types";
import { ActionSelector } from "./action-selector";
import { ReferencedColField } from "./referenced-col-field";

export const ForeignKeySelectorField = ({ index }: { index: number }) => {
	const { control } = useFormContext<AddTableFormData>();
	const tableName = useWatch({ control, name: "tableName" });
	const columnName = useWatch({ control, name: `fields.${index}.columnName` });

	const referencedTable = useWatch({
		control,
		name: `fields.${index}.foreignKey.referencedTable`,
	});

	if (!referencedTable) return null;

	return (
		<div className="flex flex-col gap-4">
			<p className="text-xs text-muted-foreground">
				Select columns from <span className="font-mono text-primary">{referencedTable}</span>{" "}
				to reference to
			</p>

			<div className="space-y-2">
				<div className="grid grid-cols-2 gap-2">
					<Label>{tableName || "Unnamed table"}</Label>
					<Label htmlFor={`fields.${index}.foreignKey.referencedColumn`}>
						{referencedTable}
					</Label>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<div className="flex items-center gap-2 flex-1">
						<span className="flex-1 truncate font-mono text-sm">
							{columnName || "Unnamed column"}
						</span>
						<ArrowRight className="size-4 aspect-square text-muted-foreground" />
					</div>

					<div className="flex items-center gap-2 flex-1">
						<ReferencedColField
							index={index}
							tableName={referencedTable}
						/>
					</div>
				</div>

				<hr className="my-8 border-border" />

				<div className="flex flex-col gap-6">
					<ActionSelector
						index={index}
						action="onUpdate"
					/>
					<ActionSelector
						index={index}
						action="onDelete"
					/>
				</div>
			</div>
		</div>
	);
};
