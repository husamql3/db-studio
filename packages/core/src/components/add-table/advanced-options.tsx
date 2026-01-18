import { Settings } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import type { AddTableFormData } from "@/types/add-table.type";
import {
	ADD_TABLE_OPTIONS,
	ARRAY_COMPATIBLE_TYPES,
	SERIAL_TYPES,
} from "@/utils/constants/add-table";

export const AdvancedOptions = ({
	index,
	isDisabled,
}: {
	index: number;
	isDisabled: boolean;
}) => {
	const { control } = useFormContext<AddTableFormData>();

	// Watch the fields needed for conditional logic
	const columnType = useWatch({
		control,
		name: `fields.${index}.columnType`,
	});

	const isPrimaryKey = useWatch({
		control,
		name: `fields.${index}.isPrimaryKey`,
	});

	// Watch all advanced option fields for the badge count
	const isNullable = useWatch({
		control,
		name: `fields.${index}.isNullable`,
	});

	const isUnique = useWatch({
		control,
		name: `fields.${index}.isUnique`,
	});

	const isIdentity = useWatch({
		control,
		name: `fields.${index}.isIdentity`,
	});

	const isArray = useWatch({
		control,
		name: `fields.${index}.isArray`,
	});

	const shouldShowOption = useCallback(
		(optionName: string) => {
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
		},
		[isPrimaryKey, columnType],
	);

	const checkedCount = useMemo(() => {
		const field = {
			isNullable,
			isUnique,
			isIdentity,
			isArray,
		};

		return ADD_TABLE_OPTIONS.filter((option) => {
			if (!shouldShowOption(option.name)) return false;
			const value = field[option.name as keyof typeof field];
			return Boolean(value);
		}).length;
	}, [isNullable, isUnique, isIdentity, isArray, shouldShowOption]);

	return (
		<div className="flex items-end justify-end">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						aria-label="Advanced options"
						type="button"
						variant="ghost"
						size="icon"
						disabled={isDisabled}
						className="h-9 w-9 relative"
					>
						<Settings className="h-4 w-4" />
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
					{ADD_TABLE_OPTIONS.map((option) => {
						if (!shouldShowOption(option.name)) return null;

						return (
							<Controller
								key={option.name}
								control={control}
								name={`fields.${index}.${option.name}`}
								render={({ field }) => (
									<Label
										htmlFor={`${option.name}-${index}`}
										className="flex items-start gap-3 rounded-lg p-3 cursor-pointer hover:bg-accent/50 has-checked:bg-primary-foreground has-checked:border-blue-600"
									>
										<Checkbox
											id={`${option.name}-${index}`}
											checked={Boolean(field.value)}
											onCheckedChange={(checked) =>
												field.onChange(Boolean(checked))
											}
											className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
											type="button"
										/>
										<div className="grid gap-1.5 font-normal">
											<p className="text-sm leading-none font-medium">
												{option.label}
											</p>
											<p className="text-sm text-muted-foreground">
												{option.description}
											</p>
										</div>
									</Label>
								)}
							/>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
};
