import { addDays, format, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DropdownNavProps, DropdownProps } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface DatePickerProps {
	value?: Date | null;
	onChange?: (date: Date | null | undefined) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	startYear?: number;
	endYear?: number;
	icon?: boolean;
	isFormatted?: boolean;
	showTime?: boolean;
}

export function DatePicker({
	value,
	onChange,
	placeholder = "Pick a date",
	className,
	disabled,
	startYear = 1980,
	endYear = new Date().getFullYear() + 10,
	icon = true,
	isFormatted = true,
	showTime = false,
}: DatePickerProps) {
	const [open, setOpen] = useState(false);

	const hours = value ? value.getHours() : 0;
	const minutes = value ? value.getMinutes() : 0;
	const seconds = value ? value.getSeconds() : 0;

	const handleCalendarChange = (
		_value: string | number,
		_e: React.ChangeEventHandler,
	) => {
		const _event = {
			target: {
				value: String(_value),
			},
		} as React.ChangeEvent<HTMLSelectElement>;
		_e(_event);
	};

	const handleSelect = (date: Date | undefined) => {
		if (date && value) {
			date.setHours(value.getHours());
			date.setMinutes(value.getMinutes());
			date.setSeconds(value.getSeconds());
		}
		onChange?.(date);
		if (!showTime) {
			setOpen(false);
		}
	};

	const handleTimeChange = (type: "hours" | "minutes" | "seconds", val: number) => {
		const newDate = value ? new Date(value) : new Date();
		if (type === "hours") newDate.setHours(val);
		if (type === "minutes") newDate.setMinutes(val);
		if (type === "seconds") newDate.setSeconds(val);
		onChange?.(newDate);
	};

	const handlePreset = (preset: "NULL" | "NOW" | "TODAY" | "YESTERDAY" | "TOMORROW") => {
		const today = startOfDay(new Date());
		switch (preset) {
			case "NULL":
				onChange?.(null);
				break;
			case "NOW":
				onChange?.(new Date());
				break;
			case "TODAY":
				onChange?.(today);
				break;
			case "YESTERDAY":
				onChange?.(addDays(today, -1));
				break;
			case "TOMORROW":
				onChange?.(addDays(today, 1));
				break;
		}
	};

	const hoursArray = Array.from({ length: 24 }, (_, i) => i);
	const minutesArray = Array.from({ length: 60 }, (_, i) => i);
	const secondsArray = Array.from({ length: 60 }, (_, i) => i);

	const displayValue =
		value && value instanceof Date && !Number.isNaN(value.getTime())
			? isFormatted
				? showTime
					? format(value, "dd/MM/yyyy HH:mm:ss")
					: format(value, "dd/MM/yyyy")
				: format(value, "yyyy-MM-dd HH:mm:ss")
			: value === null
				? "NULL"
				: placeholder;

	return (
		<Popover
			open={open}
			onOpenChange={setOpen}
		>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className={cn(
						"w-[280px] justify-start text-left font-normal",
						!value && "text-muted-foreground",
						className,
					)}
					disabled={disabled}
				>
					{icon && <CalendarIcon className="mr-2 h-4 w-4" />}
					{displayValue}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-auto p-0"
				align="end"
			>
				<div className="flex">
					<div className="flex flex-col gap-1 p-2 border-r">
						<Button
							variant="ghost"
							size="sm"
							className="justify-start text-xs h-7"
							onClick={() => handlePreset("NULL")}
						>
							NULL
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="justify-start text-xs h-7"
							onClick={() => handlePreset("NOW")}
						>
							NOW
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="justify-start text-xs h-7"
							onClick={() => handlePreset("TODAY")}
						>
							TODAY
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="justify-start text-xs h-7"
							onClick={() => handlePreset("YESTERDAY")}
						>
							YESTERDAY
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="justify-start text-xs h-7"
							onClick={() => handlePreset("TOMORROW")}
						>
							TOMORROW
						</Button>
					</div>
					<Calendar
						components={{
							Dropdown: (props: DropdownProps) => {
								return (
									<Select
										onValueChange={(value) => {
											if (props.onChange) {
												handleCalendarChange(value, props.onChange);
											}
										}}
										value={String(props.value)}
									>
										<SelectTrigger className="h-8 w-fit font-medium first-letter:capitalize focus:ring-0 focus:ring-offset-0">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{props.options?.map((option) => (
												<SelectItem
													key={option.value}
													value={String(option.value)}
												>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								);
							},
							DropdownNav: (props: DropdownNavProps) => {
								return (
									<div className="flex w-full items-center gap-2">{props.children}</div>
								);
							},
						}}
						defaultMonth={value || new Date()}
						hideNavigation
						mode="single"
						onSelect={handleSelect}
						selected={value || undefined}
						startMonth={new Date(startYear, 0)}
						endMonth={new Date(endYear, 11)}
					/>
					{showTime && (
						<div className="flex border-l">
							<TimeColumn
								label="H"
								values={hoursArray}
								selected={hours}
								onChange={(val) => handleTimeChange("hours", val)}
							/>
							<TimeColumn
								label="M"
								values={minutesArray}
								selected={minutes}
								onChange={(val) => handleTimeChange("minutes", val)}
							/>
							<TimeColumn
								label="S"
								values={secondsArray}
								selected={seconds}
								onChange={(val) => handleTimeChange("seconds", val)}
							/>
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function TimeColumn({
	label,
	values,
	selected,
	onChange,
}: {
	label: string;
	values: number[];
	selected: number;
	onChange: (val: number) => void;
}) {
	const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

	useEffect(() => {
		const selectedRef = itemRefs.current.get(selected);
		if (selectedRef) {
			selectedRef.scrollIntoView({ block: "center", behavior: "auto" });
		}
	}, [selected]);

	return (
		<div className="flex flex-col">
			<div className="px-3 py-2 text-xs font-medium text-muted-foreground text-center border-b">
				{label}
			</div>
			<ScrollArea className="h-[224px]">
				<div className="flex flex-col p-1">
					{values.map((val) => (
						<button
							key={val}
							ref={(el) => {
								if (el) itemRefs.current.set(val, el);
							}}
							type="button"
							onClick={() => onChange(val)}
							className={cn(
								"w-10 h-8 text-sm rounded-md hover:bg-accent flex items-center justify-center",
								selected === val && "bg-primary text-primary-foreground hover:bg-primary",
							)}
						>
							{val.toString().padStart(2, "0")}
						</button>
					))}
				</div>
			</ScrollArea>
		</div>
	);
}
