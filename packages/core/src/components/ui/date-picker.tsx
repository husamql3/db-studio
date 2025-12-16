"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import * as React from "react";
import type { DropdownNavProps, DropdownProps } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface DatePickerProps {
	value?: Date;
	onChange?: (date: Date | undefined) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	startYear?: number;
	endYear?: number;
	icon?: boolean;
	isFormatted?: boolean;
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
}: DatePickerProps) {
	const [open, setOpen] = React.useState(false);

	const handleCalendarChange = (
		_value: string | number,
		_e: React.ChangeEventHandler<HTMLSelectElement>,
	) => {
		const _event = {
			target: {
				value: String(_value),
			},
		} as React.ChangeEvent<HTMLSelectElement>;
		_e(_event);
	};

	const handleSelect = (date: Date | undefined) => {
		onChange?.(date);
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={setOpen}
		>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className={cn(
						"w-full justify-start text-left font-normal",
						!value && "text-muted-foreground",
						className,
					)}
					disabled={disabled}
				>
					{icon && <CalendarIcon className="mr-2 size-4 shrink-0" />}
					<span className="flex-1">
						{value
							? isFormatted
								? format(value, "dd/MM/yyyy")
								: value.toISOString()
							: placeholder}
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-auto p-0"
				align="start"
			>
				<Calendar
					captionLayout="dropdown"
					classNames={{
						month_caption: "mx-0",
					}}
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
									<SelectTrigger className="h-8 w-fit font-medium first:grow">
										<SelectValue />
									</SelectTrigger>
									<SelectContent className="max-h-[min(26rem,var(--radix-select-content-available-height))]">
										{props.options?.map((option) => (
											<SelectItem
												disabled={option.disabled}
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
					selected={value}
					startMonth={new Date(startYear, 0)}
					endMonth={new Date(endYear, 11)}
				/>
			</PopoverContent>
		</Popover>
	);
}
