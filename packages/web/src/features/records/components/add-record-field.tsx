import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { DatePicker } from "@db-studio/ui/date-picker";
import { Input } from "@db-studio/ui/input";
import { Label } from "@db-studio/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { Textarea } from "@db-studio/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { Clock, Link, RefreshCw } from "lucide-react";
import { Controller, type ControllerRenderProps, useFormContext } from "react-hook-form";
import type { AddRecordFormData } from "@/shared/api";
import { parseDateValue, toDateValue } from "@/utils/date-values";
import { openRecordReference } from "../stores/record-reference.store";

export const AddRecordField = ({
	columnName,
	dataTypeLabel,
	columnDefault,
	enumValues,
	isForeignKey,
	referencedTable,
	referencedSchema,
	referencedColumn,
	hideLabel = false,
}: ColumnInfoSchemaType & { hideLabel?: boolean }) => {
	const { control } = useFormContext<AddRecordFormData>();

	const openReference = () => {
		if (referencedTable && referencedColumn) {
			openRecordReference({
				tableName: referencedTable,
				schemaName: referencedSchema,
				columnName,
				referencedColumn,
			});
		}
	};

	const renderInputField = (field: ControllerRenderProps<AddRecordFormData, string>) => {
		const safeField = {
			...field,
			value: field.value ?? "",
		};

		// Without a visible <Label>, name each primary control directly. The
		// visible-label path stays associated through htmlFor and is untouched.
		const controlName = hideLabel ? columnName : undefined;

		if (isForeignKey) {
			return (
				<div className="flex flex-col gap-2">
					<div className="flex">
						<Input
							id={columnName}
							aria-label={controlName}
							placeholder={columnDefault ?? ""}
							className="-me-px flex-1 rounded-e-none shadow-none focus-visible:z-10"
							{...safeField}
						/>

						<Tooltip>
							<TooltipTrigger asChild>
								<button
									aria-label="Go to table"
									className="inline-flex w-9 items-center justify-center rounded-e-sm border  border-input bg-background text-muted-foreground/80 text-sm outline-none transition-[color,box-shadow] hover:text-accent-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
									type="button"
									onClick={openReference}
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
					</div>

					<span className="text-xs text-muted-foreground">
						Has a foreign key relation to{" "}
						<button
							type="button"
							className="font-mono text-primary"
							onClick={openReference}
						>
							{referencedTable}
						</button>{" "}
						table
					</span>
				</div>
			);
		}

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
					aria-label={controlName}
					type="number"
					placeholder={columnDefault ?? "0"}
					{...safeField}
				/>
			);
		}

		if (dataTypeLabel === "boolean") {
			return (
				<Select
					value={field.value}
					onValueChange={(value) => field.onChange(value)}
				>
					<SelectTrigger
						aria-label={controlName}
						className="w-full"
					>
						<SelectValue placeholder={columnDefault ?? "true"} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="true">true</SelectItem>
						<SelectItem value="false">false</SelectItem>
					</SelectContent>
				</Select>
			);
		}

		if (dataTypeLabel === "text" || dataTypeLabel === "xml") {
			return (
				<Textarea
					id={columnName}
					aria-label={controlName}
					placeholder={columnDefault ?? ""}
					rows={4}
					{...safeField}
				/>
			);
		}

		if (dataTypeLabel === "json" || dataTypeLabel === "jsonb") {
			return (
				<Textarea
					id={columnName}
					aria-label={controlName}
					placeholder={columnDefault ?? '{"key": "value"}'}
					rows={6}
					{...safeField}
				/>
			);
		}

		if (
			dataTypeLabel === "date" ||
			dataTypeLabel === "timestamptz" ||
			dataTypeLabel === "timestamp"
		) {
			const showTime = dataTypeLabel !== "date";

			const nowDefaults = showTime
				? ["current_timestamp", "now()", "localtimestamp"]
				: ["current_date", "now()", "curdate()"];

			const hasNowDefault = nowDefaults.some((name) =>
				columnDefault?.toLowerCase().includes(name),
			);

			const picker = (
				<DatePicker
					value={
						field.value ? parseDateValue(field.value) : field.value === "" ? null : undefined
					}
					onChange={(date) => field.onChange(date ? toDateValue(date, dataTypeLabel) : "")}
					showTime={showTime}
					isFormatted={!showTime}
					placeholder={
						columnDefault ?? (showTime ? "Select a date and time" : "Select a date")
					}
					className={
						hasNowDefault
							? "-me-px flex-1 rounded-e-none shadow-none focus-visible:z-10"
							: undefined
					}
				/>
			);

			if (!hasNowDefault) return picker;

			return (
				<div className="flex">
					{picker}
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								aria-label="Set to now"
								className="inline-flex w-7 items-center justify-center rounded-e-sm border border-input bg-background text-muted-foreground/80 text-sm outline-none transition-[color,box-shadow] hover:text-accent-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
								type="button"
								onClick={() => field.onChange(toDateValue(new Date(), dataTypeLabel))}
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
				</div>
			);
		}

		if (dataTypeLabel === "uuid") {
			return (
				<div className="flex">
					<Input
						id={columnName}
						aria-label={controlName}
						type="text"
						placeholder={columnDefault ?? ""}
						pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
						className="-me-px flex-1 rounded-e-none shadow-none focus-visible:z-10"
						{...safeField}
					/>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								aria-label="Generate UUID"
								className="inline-flex w-9 items-center justify-center rounded-e-sm border border-input bg-background text-muted-foreground/80 text-sm outline-none transition-[color,box-shadow] hover:text-accent-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
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
				</div>
			);
		}

		if (dataTypeLabel === "array") {
			return (
				<Textarea
					id={columnName}
					aria-label={controlName}
					placeholder={columnDefault ?? '["item1", "item2"]'}
					rows={3}
					{...safeField}
				/>
			);
		}

		if (dataTypeLabel === "enum") {
			if (enumValues && enumValues.length > 0) {
				return (
					<Select
						value={field.value}
						onValueChange={(value) => field.onChange(value)}
					>
						<SelectTrigger
							aria-label={controlName}
							className="w-full"
						>
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

			return (
				<Input
					id={columnName}
					aria-label={controlName}
					placeholder={columnDefault ?? ""}
					{...safeField}
				/>
			);
		}

		if (dataTypeLabel === "interval") {
			return (
				<Input
					id={columnName}
					aria-label={controlName}
					type="text"
					placeholder={columnDefault ?? "1 day"}
					{...safeField}
				/>
			);
		}

		if (dataTypeLabel === "bytea") {
			// A file input cannot be controlled: assigning a non-empty value throws
			// InvalidStateError in the browser. Show any stored bytes read-only and
			// leave the picker uncontrolled so it only ever carries a replacement.
			const { value: storedValue, ...fileField } = safeField;
			const storedText = typeof storedValue === "string" ? storedValue : "";

			return (
				<div className="flex flex-col gap-2">
					{storedText && (
						<div
							role="group"
							aria-label={`${columnName} stored value`}
							className="truncate rounded-md border border-input bg-muted/40 px-3 py-2 font-mono text-xs"
						>
							{storedText}
						</div>
					)}
					<Input
						id={columnName}
						aria-label={controlName}
						type="file"
						{...fileField}
					/>
				</div>
			);
		}

		if (
			dataTypeLabel === "inet" ||
			dataTypeLabel === "cidr" ||
			dataTypeLabel === "macaddr" ||
			dataTypeLabel === "macaddr8"
		) {
			return (
				<Input
					id={columnName}
					aria-label={controlName}
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

		if (dataTypeLabel === "point" || dataTypeLabel === "line" || dataTypeLabel === "polygon") {
			return (
				<Input
					id={columnName}
					aria-label={controlName}
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

		return (
			<Input
				id={columnName}
				aria-label={controlName}
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
			render={({ field }) =>
				hideLabel ? (
					<div
						role="group"
						aria-label={columnName}
					>
						{renderInputField(field)}
					</div>
				) : (
					<div className="grid grid-cols-3 gap-4">
						<div className="col-span-1 flex flex-col gap-1">
							<Label htmlFor={columnName}>{columnName}</Label>
							<span className="text-xs text-muted-foreground">{dataTypeLabel}</span>
						</div>
						<div className="col-span-2 w-full">{renderInputField(field)}</div>
					</div>
				)
			}
		/>
	);
};
