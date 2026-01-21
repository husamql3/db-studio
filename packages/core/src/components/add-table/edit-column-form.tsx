import { CheckIcon, ChevronDownIcon, Loader2Icon } from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import {
	Controller,
	type FieldErrors,
	FormProvider,
	useForm,
} from "react-hook-form";
import { foreignKeyDataSchema } from "shared/types";
import z from "zod";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useTableColumn } from "@/hooks/use-table-column";
import { cn } from "@/lib/utils";
import { useSheetStore } from "@/stores/sheet.store";
import { CONSTANTS } from "@/utils/constants";
import {
	ARRAY_COMPATIBLE_TYPES,
	PSQL_TYPES,
	SERIAL_TYPES,
} from "@/utils/constants/add-table";
import { Checkbox } from "../ui/checkbox";
import { Separator } from "../ui/separator";
import { FormActions } from "./add-record/form-actions";

export const editColumnFormSchema = z.object({
	columnName: z.string().min(1, "Column name is required"),
	columnType: z.string().min(1, "Column type is required"),
	defaultValue: z.string(),
	isPrimaryKey: z.boolean(),
	isNullable: z.boolean(),
	isUnique: z.boolean(),
	isIdentity: z.boolean(),
	isArray: z.boolean(),
	foreignKeys: foreignKeyDataSchema,
});

export type EditColumnFormData = z.infer<typeof editColumnFormSchema>;

export const EditColumnForm = ({ tableName }: { tableName: string }) => {
	const [columnName] = useQueryState(CONSTANTS.COLUMN_NAME);
	const { closeSheet, isSheetOpen } = useSheetStore();
	const [typePickerOpen, setTypePickerOpen] = useState(false);

	const { columnData, isLoadingColumn } = useTableColumn({
		tableName,
		columnName,
	});

	const methods = useForm<EditColumnFormData>({
		mode: "onSubmit",
		defaultValues: {
			columnName: columnName ?? "",
			columnType: "",
			defaultValue: "",
			isPrimaryKey: false,
			isNullable: true,
			isUnique: false,
			isIdentity: false,
			isArray: false,
		},
	});

	const {
		control,
		register,
		setValue,
		reset,
		formState: { errors },
	} = methods;
	const _referencedTable = methods.watch("foreignKeys.referencedTable");

	// Populate form when column data is fetched
	useEffect(() => {
		if (columnData) {
			reset({
				columnName: columnData.columnName,
				columnType: columnData.dataTypeLabel,
				defaultValue: columnData.columnDefault ?? "",
				isPrimaryKey: columnData.isPrimaryKey,
				isNullable: columnData.isNullable,
				isUnique: columnData.isUnique,
				isIdentity: false, // Not available from column info currently
				isArray: columnData.dataTypeLabel.endsWith("[]"),
				foreignKeys: columnData.isForeignKey
					? {
							columnName: columnData.columnName,
							referencedTable: columnData.referencedTable ?? "",
							referencedColumn: columnData.referencedColumn ?? "",
							onUpdate: columnData.onUpdate ?? "NO ACTION",
							onDelete: columnData.onDelete ?? "NO ACTION",
						}
					: undefined,
			});
		}
	}, [columnData, reset]);

	const onSubmit = (data: EditColumnFormData) => {
		console.log("onSubmit", data);
	};

	const onError = (errors: FieldErrors<EditColumnFormData>) => {
		console.log("onError", errors);
	};

	const handleCancel = () => {
		methods.reset();
		closeSheet(`edit-column-${columnName}`);
	};

	return (
		<SheetSidebar
			title={`Edit column: ${columnName}`}
			open={isSheetOpen(`edit-column-${columnName}`)}
			onOpenChange={(open) => {
				if (!open) {
					closeSheet(`edit-column-${columnName}`);
					methods.reset();
				}
			}}
			size="max-w-lg!"
		>
			{isLoadingColumn ? (
				<div className="flex items-center justify-center py-12">
					<Loader2Icon className="size-6 animate-spin text-muted-foreground" />
				</div>
			) : (
				<FormProvider {...methods}>
					<form
						onSubmit={methods.handleSubmit(onSubmit, onError)}
						className="space-y-6"
					>
						<Controller
							control={control}
							name="columnName"
							render={() => (
								<div className="flex flex-col gap-2">
									<Label htmlFor="columnName">Column Name</Label>

									<div className="flex">
										<Input
											id="columnName"
											{...register("columnName")}
											placeholder="column_name"
											className={
												errors?.columnName
													? "border-destructive ring-destructive ring-1"
													: ""
											}
										/>
									</div>
								</div>
							)}
						/>

						<Controller
							control={control}
							name="columnType"
							render={({ field }) => (
								<div className="flex flex-col gap-2">
									<Label htmlFor="columnType">Column Type</Label>

									<Popover
										open={typePickerOpen}
										onOpenChange={setTypePickerOpen}
									>
										<PopoverTrigger asChild>
											<Button
												id="columnType"
												role="combobox"
												aria-expanded={typePickerOpen}
												variant="outline"
												className={cn(
													"w-full justify-between border-input bg-background px-3 font-normal hover:bg-background",
													errors?.columnType
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
													{Object.entries(PSQL_TYPES).map(
														([category, types]) => (
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
																				setValue("isIdentity", false);
																			}

																			// Auto-disable array when type is not array-compatible
																			if (
																				type.value &&
																				!ARRAY_COMPATIBLE_TYPES.includes(
																					type.value,
																				)
																			) {
																				setValue("isArray", false);
																			}

																			setTypePickerOpen(false);
																		}}
																	>
																		<div className="flex flex-col gap-1 items-start flex-1">
																			<p className="font-medium">
																				{type.label}
																			</p>
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
														),
													)}
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>
							)}
						/>

						<Controller
							control={control}
							name="defaultValue"
							render={() => (
								<div className="flex flex-col gap-2">
									<Label htmlFor="defaultValue">Default Value</Label>
									<Input
										id="defaultValue"
										{...register("defaultValue")}
										placeholder="NULL"
										className={
											errors?.defaultValue
												? "border-destructive ring-destructive ring-1"
												: ""
										}
									/>
								</div>
							)}
						/>

						<Separator />

						<div className="flex flex-col gap-4">
							<Label>Foreign Keys</Label>
						</div>

						<Separator />

						<div className="flex flex-col gap-4">
							<Label>Constraints</Label>

							<Controller
								control={control}
								name="isPrimaryKey"
								render={({ field }) => (
									<div className="flex gap-2">
										<Checkbox
											id="isPrimaryKey"
											type="button"
											checked={field.value ?? false}
											onCheckedChange={(checked) =>
												field.onChange(Boolean(checked))
											}
											className="size-5"
											onClick={(e) => {
												e.preventDefault();
												field.onChange(Boolean(!field.value));
											}}
										/>
										<Label
											htmlFor="isPrimaryKey"
											className="cursor-pointer"
										>
											{" "}
											Is Primary Key
										</Label>
									</div>
								)}
							/>

							<Controller
								control={control}
								name="isNullable"
								render={({ field }) => (
									<div className="flex gap-2">
										<Checkbox
											id="isNullable"
											type="button"
											checked={field.value ?? false}
											onCheckedChange={(checked) =>
												field.onChange(Boolean(checked))
											}
											className="size-5"
											onClick={(e) => {
												e.preventDefault();
												field.onChange(Boolean(!field.value));
											}}
										/>
										<Label
											htmlFor="isNullable"
											className="cursor-pointer"
										>
											{" "}
											Is Nullable
										</Label>
									</div>
								)}
							/>

							<Controller
								control={control}
								name="isUnique"
								render={({ field }) => (
									<div className="flex gap-2">
										<Checkbox
											id="isUnique"
											type="button"
											checked={field.value ?? false}
											onCheckedChange={(checked) =>
												field.onChange(Boolean(checked))
											}
											className="size-5"
											onClick={(e) => {
												e.preventDefault();
												field.onChange(Boolean(!field.value));
											}}
										/>
										<Label
											htmlFor="isUnique"
											className="cursor-pointer"
										>
											{" "}
											Is Unique
										</Label>
									</div>
								)}
							/>
						</div>

						<FormActions
							onCancel={handleCancel}
							isLoading={false}
						/>
					</form>
				</FormProvider>
			)}
		</SheetSidebar>
	);
};
