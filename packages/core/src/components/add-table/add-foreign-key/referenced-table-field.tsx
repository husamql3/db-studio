import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { AddTableFormData, ForeignKeyDataType } from "shared/types";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useTablesList } from "@/hooks/use-tables-list";
import { cn } from "@/lib/utils";

export const ReferencedTableField = ({ index }: { index: number }) => {
	const [open, setOpen] = useState<boolean>(false);
	const { tablesList, isLoadingTablesList } = useTablesList();
	const { control, watch, setValue, getValues } =
		useFormContext<AddTableFormData>();

	const columnName = watch(`fields.${index}.columnName`);

	// Ensure foreign key entry exists at this index
	const ensureForeignKeyExists = () => {
		const currentForeignKeys = getValues("foreignKeys") || [];
		if (!currentForeignKeys[index]) {
			// Pad the array with nulls if necessary
			const paddedArray: ForeignKeyDataType[] = [...currentForeignKeys];
			// while (paddedArray.length < index) {
			// 	paddedArray.push(null);
			// }
			paddedArray.push({
				columnName: "",
				referencedTable: "",
				referencedColumn: "",
				onUpdate: "NO ACTION" as const,
				onDelete: "NO ACTION" as const,
			});
			setValue("foreignKeys", paddedArray);
		}
	};

	return (
		<Controller
			control={control}
			name={`foreignKeys.${index}`}
			render={({ field }) => (
				<div className="flex flex-col gap-2">
					<Label htmlFor="referencedTable">
						Select a table to reference to
					</Label>
					<Popover
						onOpenChange={(isOpen) => {
							if (isOpen) {
								// Create foreign key entry when opening the popover
								ensureForeignKeyExists();
							}
							setOpen(isOpen);
						}}
						open={open}
					>
						<PopoverTrigger asChild>
							<Button
								aria-expanded={open}
								className="w-full justify-between border-input bg-background px-3 font-normal outline-none outline-offset-0 hover:bg-background focus-visible:outline-[3px]"
								id="referencedTable"
								role="combobox"
								variant="outline"
								disabled={isLoadingTablesList}
							>
								<span
									className={cn(
										"truncate",
										!field.value?.referencedTable && "text-muted-foreground",
									)}
								>
									{field.value?.referencedTable || "---"}
								</span>
								<ChevronDownIcon
									aria-hidden="true"
									className="shrink-0 text-muted-foreground/80"
									size={16}
								/>
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="start"
							className="w-full min-w-(--radix-popper-anchor-width) border-input p-0"
						>
							<Command>
								<CommandInput placeholder="Search table..." />
								<CommandList>
									<CommandEmpty>No table found.</CommandEmpty>
									<CommandGroup>
										{tablesList?.map((table) => (
											<CommandItem
												key={table.tableName}
												onSelect={() => {
													field.onChange({
														...field.value,
														referencedTable: table.tableName,
													});

													//* set the column name field to the column name of the referenced table
													setValue(
														`foreignKeys.${index}.columnName`,
														columnName,
													);
													console.log(
														`foreignKeys.${index}.columnName`,
														columnName,
													);

													setOpen(false);
												}}
												value={table.tableName}
											>
												{table.tableName}
												{field.value?.referencedTable === table.tableName && (
													<CheckIcon
														className="ml-auto"
														size={16}
													/>
												)}
											</CommandItem>
										))}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
				</div>
			)}
		/>
	);
};
