import { useForm, useStore } from "@tanstack/react-form";
import { CheckIcon, ChevronDownIcon, Settings, XIcon } from "lucide-react";
import { useState } from "react";
import { FieldError } from "@/components/common/field-error";
import { Sheet } from "@/components/components/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSheetStore } from "@/stores/sheet.store";
import { type AddTableFormData, addTableSchema } from "@/types/add-table.type";
import { cn } from "@/utils/cn";
import { ADD_TABLE_OPTIONS, ARRAY_COMPATIBLE_TYPES, PSQL_TYPES, SERIAL_TYPES } from "@/utils/constants/add-table";

const defaultValues: AddTableFormData = {
	tableName: "",
	columnName: "",
	columnType: "",
	defaultValue: "",
	isPrimaryKey: false,
	isNullable: true,
	isUnique: false,
	isIdentity: false,
	isArray: false,
};

export const AddTableForm = () => {
	const { closeSheet } = useSheetStore();
	const [typePickerOpen, setTypePickerOpen] = useState(false);

	const form = useForm({
		defaultValues,
		validators: {
			onSubmit: addTableSchema,
		},
		onSubmit: async ({ value }) => {
			console.log("Form submitted:", value);
		},
		onSubmitInvalid: ({ meta }) => {
			console.log(meta);
		},
	});

	const handleSubmit = () => {
		form.handleSubmit();
		console.log(form.state.errors);
	};

	const handleCancel = () => {
		closeSheet();
		form.reset();
	};

	const columnType = useStore(form.baseStore, (state) => state.values.columnType);
	const isPrimaryKey = useStore(form.baseStore, (state) => state.values.isPrimaryKey);

	// Helper function to check if an option should be visible
	const shouldShowOption = (optionName: string) => {
		switch (optionName) {
			case "isNullable":
				// Hide when primary key is selected
				return !isPrimaryKey;
			case "isIdentity":
				// Hide when serial types are selected
				return !SERIAL_TYPES.includes(columnType);
			case "isArray":
				// Hide when type is not array-compatible
				return ARRAY_COMPATIBLE_TYPES.includes(columnType);
			default:
				return true;
		}
	};

	const checkedCount = useStore(form.baseStore, (state) => {
		return ADD_TABLE_OPTIONS.filter((option) => {
			if (!shouldShowOption(option.name)) return false;
			const value = state.values[option.name as keyof AddTableFormData];
			return Boolean(value);
		}).length;
	});

	const handleSubmitForm = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		form.handleSubmit();
	};

	return (
		<Sheet title="Create a new table" name="add-table">
			<form className="px-5 py-6 space-y-6" onSubmit={handleSubmitForm}>
				{/* Name Field */}
				<form.Field name="tableName">
					{(field) => {
						return (
							<div className="flex gap-24">
								<Label htmlFor="tableName">Name</Label>
								<div className="flex-1 space-y-1">
									<Input
										id="tableName"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										className={cn(field.state.meta.errors.length > 0 && "border-destructive ring-destructive ring-1")}
									/>
									<FieldError error={field.state.meta.errors[0]?.message} />
								</div>
							</div>
						);
					}}
				</form.Field>

				<div className="grid grid-cols-4 gap-4">
					{/* Column Name Field */}
					<form.Field name="columnName">
						{(field) => (
							<div className="flex flex-col gap-2">
								<Label htmlFor="columnName">Name</Label>
								<Input
									id="columnName"
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="column_name"
								/>
							</div>
						)}
					</form.Field>

					{/* Column Type Field */}
					<form.Field
						name="columnType"
						validators={{
							onChange: ({ value }) => {
								// Auto-disable identity when serial types are selected
								if (SERIAL_TYPES.includes(value)) {
									form.setFieldValue("isIdentity", false);
								}
								// Auto-disable array when type is not array-compatible
								if (value && !ARRAY_COMPATIBLE_TYPES.includes(value)) {
									form.setFieldValue("isArray", false);
								}
								return undefined;
							},
						}}
					>
						{(field) => (
							<div className="flex flex-col gap-2">
								<Label htmlFor="columnType">Type</Label>
								<Popover open={typePickerOpen} onOpenChange={setTypePickerOpen}>
									<PopoverTrigger asChild>
										<Button
											id="columnType"
											role="combobox"
											aria-expanded={typePickerOpen}
											variant="outline"
											className="w-full justify-between border-input bg-background px-3 font-normal hover:bg-background"
										>
											{field.state.value || "Select type..."}
											<ChevronDownIcon aria-hidden="true" className="-me-1 opacity-60" size={16} />
										</Button>
									</PopoverTrigger>
									<PopoverContent align="start" className="w-full min-w-[--radix-popper-anchor-width] border-input p-0">
										<Command>
											<CommandInput placeholder="Search type..." />
											<CommandList>
												<CommandEmpty>No type found.</CommandEmpty>
												{Object.entries(PSQL_TYPES).map(([category, types]) => (
													<CommandGroup key={category} heading={category}>
														{types.map((type) => (
															<CommandItem
																key={type.value}
																value={`${type.label} ${type.description}`}
																onSelect={() => {
																	field.handleChange(type.value);
																	setTypePickerOpen(false);
																}}
															>
																<div className="flex flex-col gap-1 items-start flex-1">
																	<p className="font-medium">{type.label}</p>
																	<span className="text-xs text-muted-foreground">{type.description}</span>
																</div>
																{field.state.value === type.value && (
																	<CheckIcon className="ml-auto shrink-0" size={16} />
																)}
															</CommandItem>
														))}
													</CommandGroup>
												))}
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
							</div>
						)}
					</form.Field>

					{/* Default Value Field */}
					<form.Field name="defaultValue">
						{(field) => (
							<div className="flex flex-col gap-2">
								<Label htmlFor="defaultValue">Default Value</Label>
								<Input
									id="defaultValue"
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="NULL"
								/>
							</div>
						)}
					</form.Field>

					{/* Primary Key + Actions */}
					<div className="flex gap-2">
						<form.Field
							name="isPrimaryKey"
							validators={{
								onChange: ({ value }) => {
									// Auto-disable nullable when primary key is selected
									if (value) {
										form.setFieldValue("isNullable", false);
									}
									return undefined;
								},
							}}
						>
							{(field) => (
								<div className="flex flex-col gap-2">
									<Label htmlFor="isPrimaryKey">Primary</Label>
									<div className="flex flex-1 items-center justify-start">
										<Checkbox
											id="isPrimaryKey"
											checked={field.state.value}
											onCheckedChange={(checked) => field.handleChange(Boolean(checked))}
											className="h-5 w-5"
										/>
									</div>
								</div>
							)}
						</form.Field>

						{/* Advanced Options Dropdown */}
						<div className="flex items-end justify-end">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										aria-label="Advanced options"
										type="button"
										variant="ghost"
										size="icon"
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
								<DropdownMenuContent className="w-96 space-y-1" side="bottom" align="end">
									{ADD_TABLE_OPTIONS.map((option) => {
										if (!shouldShowOption(option.name)) return null;

										return (
											<form.Field key={option.name} name={option.name}>
												{(field) => (
													<Label
														htmlFor={option.name}
														className="flex items-start gap-3 rounded-lg p-3 cursor-pointer hover:bg-accent/50 has-checked:bg-primary-foreground has-checked:border-blue-600"
													>
														<Checkbox
															id={option.name}
															checked={Boolean(field.state.value)}
															onCheckedChange={(checked) => field.handleChange(Boolean(checked))}
															className="data-[state=checked]:bg-blue-600  data-[state=checked]:border-blue-600"
															type="button"
														/>
														<div className="grid gap-1.5 font-normal">
															<p className="text-sm leading-none font-medium">{option.label}</p>
															<p className="text-sm text-muted-foreground">{option.description}</p>
														</div>
													</Label>
												)}
											</form.Field>
										);
									})}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>

						{/* Reset Button */}
						<div className="flex items-end justify-center">
							<Button type="button" variant="ghost" size="icon" className="h-9 w-9">
								<XIcon className="h-4 w-4" />
							</Button>
						</div>
					</div>
				</div>

				{/* Form Actions */}
				<div className="flex justify-end gap-2">
					<Button type="button" variant="outline" onClick={handleCancel}>
						Cancel
					</Button>

					<Button type="submit" variant="default" onClick={handleSubmit}>
						Save
					</Button>
				</div>
			</form>
		</Sheet>
	);
};
