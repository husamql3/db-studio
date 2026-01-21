import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { AddTableFormData } from "shared/types";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
	ARRAY_COMPATIBLE_TYPES,
	PSQL_TYPES,
	SERIAL_TYPES,
} from "@/utils/constants/add-table";

export const ColumnTypeField = ({ index }: { index: number }) => {
	const [typePickerOpen, setTypePickerOpen] = useState(false);

	const {
		control,
		setValue,
		formState: { errors },
	} = useFormContext<AddTableFormData>();

	return (
		<Controller
			control={control}
			name={`fields.${index}.columnType`}
			render={({ field }) => (
				<Popover
					open={typePickerOpen}
					onOpenChange={setTypePickerOpen}
				>
					<PopoverTrigger asChild>
						<Button
							id={`columnType-${index}`}
							role="combobox"
							aria-expanded={typePickerOpen}
							variant="outline"
							className={cn(
								"w-full justify-between border-input bg-background px-3 font-normal hover:bg-background",
								errors?.fields?.[index]?.columnType
									? "border-destructive ring-destructive ring-1"
									: "",
							)}
						>
							{field.value || "Select type"}
							<ChevronDownIcon
								aria-hidden="true"
								className="-me-1 opacity-60"
								size={16}
							/>
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="start"
						className="w-full min-w-[--radix-popper-anchor-width] border-input p-0"
					>
						<Command>
							<CommandInput placeholder="Search type..." />
							<CommandList>
								<CommandEmpty>No type found.</CommandEmpty>
								{Object.entries(PSQL_TYPES).map(([category, types]) => (
									<CommandGroup
										key={category}
										heading={category}
									>
										{types.map((type) => (
											<CommandItem
												key={type.value}
												value={`${type.label} ${type.description}`}
												onSelect={() => {
													field.onChange(type.value);

													// Auto-disable identity when serial types are selected
													if (SERIAL_TYPES.includes(type.value)) {
														setValue(`fields.${index}.isIdentity`, false);
													}

													// Auto-disable array when type is not array-compatible
													if (
														type.value &&
														!ARRAY_COMPATIBLE_TYPES.includes(type.value)
													) {
														setValue(`fields.${index}.isArray`, false);
													}

													setTypePickerOpen(false);
												}}
											>
												<div className="flex flex-col gap-1 items-start flex-1">
													<p className="font-medium">{type.label}</p>
													<span className="text-xs text-muted-foreground">
														{type.description}
													</span>
												</div>
												{field.value === type.value && (
													<CheckIcon
														className="ml-auto shrink-0"
														size={16}
													/>
												)}
											</CommandItem>
										))}
									</CommandGroup>
								))}
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			)}
		/>
	);
};
