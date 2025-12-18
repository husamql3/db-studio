import { Clock, Link, RefreshCw } from "lucide-react";
import { Controller, type ControllerRenderProps, useFormContext } from "react-hook-form";
import type { ColumnInfo } from "server/src/dao/table-columns.dao";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AddRecordFormData } from "@/hooks/use-create-record";
import { useSheetStore } from "@/stores/sheet.store";

export const AddRecordField = ({
	columnName,
	dataTypeLabel,
	columnDefault,
	enumValues,
	isForeignKey,
	referencedTable,
	referencedColumn,
}: ColumnInfo) => {
	const { control } = useFormContext<AddRecordFormData>();
	const { openSheet, setRecordReference } = useSheetStore();

	const renderInputField = (field: ControllerRenderProps<AddRecordFormData, string>) => {
		// Create a safe field object that ensures value is never undefined
		const safeField = {
			...field,
			value: field.value ?? "",
		};

		if (isForeignKey) {
			return (
				<div className="flex flex-col gap-2">
					<div className="flex">
						<Input
							id={columnName}
							placeholder={columnDefault ?? ""}
							className="-me-px flex-1 rounded-e-none shadow-none focus-visible:z-10"
							{...safeField}
						/>

						<TooltipProvider delayDuration={0}>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										aria-label="Go to table"
										className="inline-flex w-9 items-center justify-center rounded-e-md border  border-input bg-background text-muted-foreground/80 text-sm outline-none transition-[color,box-shadow] hover:text-accent-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
										type="button"
										onClick={() => {
											if (referencedTable && columnName && referencedColumn) {
												setRecordReference(referencedTable, columnName, referencedColumn);
											}
											openSheet("record-reference");
										}}
									>
										<Link
											aria-hidden="true"
											className="size-4"
											size={16}
										/>
									</button>
								</TooltipTrigger>
								<TooltipContent className="px-2 py-1 text-xs">Go to table</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>

					<span className="text-xs text-muted-foreground">
						Has a foreign key relation to{" "}
						<button
							type="button"
							className="font-mono text-primary"
							onClick={() => {
								if (referencedTable && columnName && referencedColumn) {
									setRecordReference(referencedTable, columnName, referencedColumn);
								}
								openSheet("record-reference");
							}}
						>
							{referencedTable}
						</button>{" "}
						table
					</span>
				</div>
			);
		}

		// Number types (int, bigint, smallint, numeric, float, double, money)
		if (
			dataTypeLabel === "int" ||
			dataTypeLabel === "bigint" ||
			dataTypeLabel === "smallint" ||
			dataTypeLabel === "numeric" ||
			dataTypeLabel === "float" ||
			dataTypeLabel === "double" ||
			dataTypeLabel === "money"
		) {
			return (
				<Input
					id={columnName}
					type="number"
					placeholder={columnDefault ?? "0"}
					{...safeField}
				/>
			);
		}

		// Boolean type
		if (dataTypeLabel === "boolean") {
			return (
				<Select
					value={field.value}
					onValueChange={(value) => field.onChange(value)}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder={columnDefault ?? "true"} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="true">true</SelectItem>
						<SelectItem value="false">false</SelectItem>
					</SelectContent>
				</Select>
			);
		}

		// Long text types (text, xml)
		if (dataTypeLabel === "text" || dataTypeLabel === "xml") {
			return (
				<Textarea
					id={columnName}
					placeholder={columnDefault ?? ""}
					rows={4}
					{...safeField}
				/>
			);
		}

		// JSON types (json, jsonb)
		if (dataTypeLabel === "json" || dataTypeLabel === "jsonb") {
			return (
				<Textarea
					id={columnName}
					placeholder={columnDefault ?? '{"key": "value"}'}
					rows={6}
					{...safeField}
				/>
			);
		}

		// Date type
		if (
			dataTypeLabel === "date" ||
			dataTypeLabel === "timestamp" ||
			dataTypeLabel === "timestamptz"
		) {
			return (
				<div className="flex">
					<DatePicker
						value={field.value ? new Date(field.value) : undefined}
						onChange={(date) =>
							field.onChange(date ? date.toISOString().split("T")[0] : "")
						}
						placeholder={columnDefault ?? "Select a date"}
						className="-me-px flex-1 rounded-e-none shadow-none focus-visible:z-10"
					/>
					<TooltipProvider delayDuration={0}>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									aria-label="Set to now"
									className="inline-flex w-7 items-center justify-center rounded-e-md border border-input bg-background text-muted-foreground/80 text-sm outline-none transition-[color,box-shadow] hover:text-accent-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
									type="button"
									onClick={() => {
										const today = new Date().toISOString().split("T")[0];
										field.onChange(today);
									}}
								>
									<Clock
										aria-hidden="true"
										className="size-4"
										size={16}
									/>
								</button>
							</TooltipTrigger>
							<TooltipContent className="px-2 py-1 text-xs">Set to now</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			);
		}

		// UUID type
		if (dataTypeLabel === "uuid") {
			return (
				<div className="flex">
					<Input
						id={columnName}
						type="text"
						placeholder={columnDefault ?? ""}
						pattern="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
						className="-me-px flex-1 rounded-e-none shadow-none focus-visible:z-10"
						{...safeField}
					/>
					<TooltipProvider delayDuration={0}>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									aria-label="Generate UUID"
									className="inline-flex w-9 items-center justify-center rounded-e-md border border-input bg-background text-muted-foreground/80 text-sm outline-none transition-[color,box-shadow] hover:text-accent-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
									type="button"
									onClick={() => {
										const generatedUUID = crypto.randomUUID();
										field.onChange(generatedUUID);
									}}
								>
									<RefreshCw
										aria-hidden="true"
										className="size-4"
										size={16}
									/>
								</button>
							</TooltipTrigger>
							<TooltipContent className="px-2 py-1 text-xs">Generate UUID</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			);
		}

		// Array type
		if (dataTypeLabel === "array") {
			return (
				<Textarea
					id={columnName}
					placeholder={columnDefault ?? '["item1", "item2"]'}
					rows={3}
					{...safeField}
				/>
			);
		}

		// Enum type
		if (dataTypeLabel === "enum") {
			if (enumValues && enumValues.length > 0) {
				return (
					<Select
						value={field.value}
						onValueChange={(value) => field.onChange(value)}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder={columnDefault ?? "Select a value"} />
						</SelectTrigger>
						<SelectContent>
							{enumValues.map((enumValue: string) => (
								<SelectItem
									key={enumValue}
									value={enumValue}
								>
									{enumValue}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				);
			}
			// Fallback if enumValues not available
			return (
				<Input
					id={columnName}
					placeholder={columnDefault ?? ""}
					{...safeField}
				/>
			);
		}

		// Interval type
		if (dataTypeLabel === "interval") {
			return (
				<Input
					id={columnName}
					type="text"
					placeholder={columnDefault ?? "1 day"}
					{...safeField}
				/>
			);
		}

		// Binary type (bytea)
		if (dataTypeLabel === "bytea") {
			return (
				<Input
					id={columnName}
					type="file"
					{...safeField}
				/>
			);
		}

		// Network types (inet, cidr, macaddr, macaddr8)
		if (
			dataTypeLabel === "inet" ||
			dataTypeLabel === "cidr" ||
			dataTypeLabel === "macaddr" ||
			dataTypeLabel === "macaddr8"
		) {
			return (
				<Input
					id={columnName}
					type="text"
					placeholder={
						dataTypeLabel === "inet"
							? "192.168.1.1"
							: dataTypeLabel === "cidr"
								? "192.168.1.0/24"
								: dataTypeLabel === "macaddr"
									? "08:00:2b:01:02:03"
									: "08:00:2b:01:02:03:04:05"
					}
					{...safeField}
				/>
			);
		}

		// Geometric types (point, line, polygon)
		if (
			dataTypeLabel === "point" ||
			dataTypeLabel === "line" ||
			dataTypeLabel === "polygon"
		) {
			return (
				<Input
					id={columnName}
					type="text"
					placeholder={
						dataTypeLabel === "point"
							? "(x,y)"
							: dataTypeLabel === "line"
								? "{A,B,C}"
								: "((x1,y1),(x2,y2),...)"
					}
					{...safeField}
				/>
			);
		}

		// Default: Short text types (varchar, char, and others)
		return (
			<Input
				id={columnName}
				type="text"
				placeholder={columnDefault ?? ""}
				{...safeField}
			/>
		);
	};

	return (
		<Controller
			key={columnName}
			control={control}
			name={columnName}
			render={({ field }) => (
				<div className="grid grid-cols-3 gap-4">
					<div className="col-span-1 flex flex-col gap-1">
						<Label htmlFor={columnName}>{columnName}</Label>
						<span className="text-xs text-muted-foreground">{dataTypeLabel}</span>
					</div>
					<div className="col-span-2 w-full">{renderInputField(field)}</div>
				</div>
			)}
		/>
	);
};
