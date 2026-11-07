import { Badge } from "@db-studio/ui/badge";
import { Button } from "@db-studio/ui/button";
import { Checkbox } from "@db-studio/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@db-studio/ui/dropdown-menu";
import { Label } from "@db-studio/ui/label";
import { Settings } from "lucide-react";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import type { ColumnFieldValues, ColumnOptionName } from "./column-field-values";
import { ARRAY_COMPATIBLE_TYPES, COLUMN_OPTIONS, SERIAL_TYPES } from "./column-types";

export const AdvancedOptions = ({
	idPrefix,
	values,
	onChange,
}: {
	idPrefix: string;
	values: ColumnFieldValues;
	onChange: (option: ColumnOptionName, checked: boolean) => void;
}) => {
	const isDocument = useDatabaseEngine()?.dataModel === "document";
	const { columnType, isPrimaryKey } = values;

	const shouldShowOption = (optionName: ColumnOptionName) => {
		if (isDocument) {
			switch (optionName) {
				case "isIdentity":
					return false;
				case "isArray":
					return Boolean(columnType) && columnType !== "array";
				default:
					return true;
			}
		}

		switch (optionName) {
			case "isNullable":
				return !isPrimaryKey;
			case "isIdentity":
				return !SERIAL_TYPES.includes(columnType);
			case "isArray":
				return ARRAY_COMPATIBLE_TYPES.includes(columnType);
			default:
				return true;
		}
	};

	const checkedCount = COLUMN_OPTIONS.filter(
		(option) => shouldShowOption(option.name) && values[option.name],
	).length;

	return (
		<div className="flex items-end justify-end">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						aria-label="Advanced options"
						type="button"
						variant="ghost"
						size="icon"
						disabled={isPrimaryKey}
						className="size-9 relative"
					>
						<Settings className="size-4" />
						{checkedCount > 0 && (
							<Badge className="absolute -top-2 leading-0! left-full -translate-x-1/2 size-5 flex items-center justify-center text-xs">
								{checkedCount > 99 ? "99+" : checkedCount}
							</Badge>
						)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					className="w-96 space-y-1"
					side="bottom"
					align="end"
				>
					{COLUMN_OPTIONS.map((option) => {
						if (!shouldShowOption(option.name)) return null;

						return (
							<Label
								key={option.name}
								htmlFor={`${option.name}-${idPrefix}`}
								className="flex items-start gap-3 rounded-lg p-3 cursor-pointer hover:bg-accent/50 has-checked:bg-primary-foreground has-checked:border-blue-600"
							>
								<Checkbox
									id={`${option.name}-${idPrefix}`}
									checked={values[option.name]}
									onCheckedChange={(checked) => onChange(option.name, checked === true)}
									className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
									type="button"
								/>
								<div className="grid gap-1.5 font-normal">
									<p className="text-sm leading-none font-medium">{option.label}</p>
									<p className="text-sm text-muted-foreground">{option.description}</p>
								</div>
							</Label>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
};
