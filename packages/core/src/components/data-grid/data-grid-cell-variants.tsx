"use client";

import type { Cell, Table } from "@tanstack/react-table";
import {
	type ChangeEvent,
	type ComponentProps,
	type FormEvent,
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { DataGridCellWrapper } from "@/components/data-grid/data-grid-cell-wrapper";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateCellStore } from "@/stores/update-cell.store";
import { cn } from "@/utils/cn";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";

interface CellVariantProps<TData> {
	cell: Cell<TData, unknown>;
	table: Table<TData>;
	rowIndex: number;
	columnId: string;
	isEditing: boolean;
	isFocused: boolean;
	isSelected: boolean;
}

export function ShortTextCell<TData>({
	cell,
	table,
	rowIndex,
	columnId,
	isEditing,
	isFocused,
	isSelected,
}: CellVariantProps<TData>) {
	const initialValue = cell.getValue() as string;
	const [value, setValue] = useState(initialValue);
	const cellRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const meta = table.options.meta;

	const onBlur = useCallback(() => {
		// Read the current value directly from the DOM to avoid stale state
		const currentValue = cellRef.current?.textContent ?? "";
		if (currentValue !== initialValue) {
			meta?.onDataUpdate?.({ rowIndex, columnId, value: currentValue });
		}
		meta?.onCellEditingStop?.();
	}, [meta, rowIndex, columnId, initialValue]);

	const onInput = useCallback((event: FormEvent<HTMLDivElement>) => {
		const currentValue = event.currentTarget.textContent ?? "";
		setValue(currentValue);
	}, []);

	const onWrapperKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (isEditing) {
				if (event.key === "Enter") {
					event.preventDefault();
					const currentValue = cellRef.current?.textContent ?? "";
					if (currentValue !== initialValue) {
						meta?.onDataUpdate?.({ rowIndex, columnId, value: currentValue });
					}
					meta?.onCellEditingStop?.({ moveToNextRow: true });
				} else if (event.key === "Tab") {
					event.preventDefault();
					const currentValue = cellRef.current?.textContent ?? "";
					if (currentValue !== initialValue) {
						meta?.onDataUpdate?.({ rowIndex, columnId, value: currentValue });
					}
					meta?.onCellEditingStop?.({
						direction: event.shiftKey ? "left" : "right",
					});
				} else if (event.key === "Escape") {
					event.preventDefault();
					setValue(initialValue);
					cellRef.current?.blur();
				}
			} else if (
				isFocused &&
				event.key.length === 1 &&
				!event.ctrlKey &&
				!event.metaKey
			) {
				// Handle typing to pre-fill the value when editing starts
				setValue(event.key);

				queueMicrotask(() => {
					if (cellRef.current && cellRef.current.contentEditable === "true") {
						cellRef.current.textContent = event.key;
						const range = document.createRange();
						const selection = window.getSelection();
						range.selectNodeContents(cellRef.current);
						range.collapse(false);
						selection?.removeAllRanges();
						selection?.addRange(range);
					}
				});
			}
		},
		[isEditing, isFocused, initialValue, meta, rowIndex, columnId],
	);

	useEffect(() => {
		setValue(initialValue);
		if (cellRef.current && !isEditing) {
			cellRef.current.textContent = initialValue;
		}
	}, [initialValue, isEditing]);

	useEffect(() => {
		if (isEditing && cellRef.current) {
			cellRef.current.focus();

			if (!cellRef.current.textContent && value) {
				cellRef.current.textContent = value;
			}

			if (cellRef.current.textContent) {
				const range = document.createRange();
				const selection = window.getSelection();
				range.selectNodeContents(cellRef.current);
				range.collapse(false);
				selection?.removeAllRanges();
				selection?.addRange(range);
			}
		}
		// Don't focus if we're in the middle of a scroll operation
		if (
			isFocused &&
			!isEditing &&
			!meta?.searchOpen &&
			!meta?.isScrolling &&
			containerRef.current
		) {
			containerRef.current.focus();
		}
	}, [isFocused, isEditing, value, meta?.searchOpen, meta?.isScrolling]);

	const displayValue = !isEditing ? (value ?? "") : "";

	return (
		<DataGridCellWrapper
			ref={containerRef}
			cell={cell}
			table={table}
			rowIndex={rowIndex}
			columnId={columnId}
			isEditing={isEditing}
			isFocused={isFocused}
			isSelected={isSelected}
			onKeyDown={onWrapperKeyDown}
		>
			<div
				role="textbox"
				data-slot="grid-cell-content"
				contentEditable={isEditing}
				tabIndex={-1}
				ref={cellRef}
				onBlur={onBlur}
				onInput={onInput}
				suppressContentEditableWarning
				className={cn("size-full overflow-hidden outline-none", {
					"whitespace-nowrap [&_*]:inline [&_*]:whitespace-nowrap [&_br]:hidden":
						isEditing,
				})}
			>
				{displayValue}
			</div>
		</DataGridCellWrapper>
	);
}

export function LongTextCell<TData>({
	cell,
	table,
	rowIndex,
	columnId,
	isFocused,
	isEditing,
	isSelected,
}: CellVariantProps<TData>) {
	const { setUpdate, clearUpdate } = useUpdateCellStore();
	const initialValue = cell.getValue() as string;
	const [value, setValue] = useState(initialValue ?? "");
	const [open, setOpen] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const meta = table.options.meta;
	const sideOffset = -(containerRef.current?.clientHeight ?? 0);

	// Get the row data and column name for store operations
	const rowData = cell.row.original as Record<string, unknown>;
	const columnName = columnId;

	const prevInitialValueRef = useRef(initialValue);
	if (initialValue !== prevInitialValueRef.current) {
		prevInitialValueRef.current = initialValue;
		setValue(initialValue ?? "");
	}

	const onSave = useCallback(() => {
		console.log("onSave", {
			value,
			initialValue,
			columnName,
			rowData,
		});

		// Update the store with the final value
		setUpdate(rowData, columnName, value, initialValue);

		// Close the popover
		setOpen(false);
		meta?.onCellEditingStop?.();
	}, [meta, value, initialValue, columnName, rowData, setUpdate]);

	const onCancel = useCallback(() => {
		console.log("onCancel", value, initialValue);

		// Restore the original value
		setValue(initialValue ?? "");

		// Clear this cell's update from the store
		clearUpdate(rowData, columnName);

		setOpen(false);
		meta?.onCellEditingStop?.();
	}, [meta, initialValue, columnName, rowData, clearUpdate, value]);

	const onChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => {
			const newValue = event.target.value;
			console.log("onChange", newValue, columnName, value, initialValue);
			setValue(newValue);

			// Debounced update to store (tracks the change but doesn't save)
			setUpdate(rowData, columnName, newValue, initialValue);
		},
		[columnName, value, initialValue],
	);

	const onOpenChange = useCallback(
		(isOpen: boolean) => {
			setOpen(isOpen);
			if (!isOpen) {
				// When closing, update the store with current value
				if (value !== initialValue) {
					setUpdate(rowData, columnName, value, initialValue);
				}
				meta?.onCellEditingStop?.();
			}
		},
		[meta, value, initialValue, columnName, rowData, setUpdate],
	);

	const onOpenAutoFocus: NonNullable<
		ComponentProps<typeof PopoverContent>["onOpenAutoFocus"]
	> = useCallback((event) => {
		event.preventDefault();
		if (textareaRef.current) {
			textareaRef.current.focus();
			const length = textareaRef.current.value.length;
			textareaRef.current.setSelectionRange(length, length);
		}
	}, []);

	const onWrapperKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (isEditing && !open) {
				if (event.key === "Escape") {
					event.preventDefault();
					meta?.onCellEditingStop?.();
				} else if (event.key === "Tab") {
					event.preventDefault();
					// Update store when tabbing away
					if (value !== initialValue) {
						setUpdate(rowData, columnName, value, initialValue);
					}
					meta?.onCellEditingStop?.({
						direction: event.shiftKey ? "left" : "right",
					});
				}
			}
		},
		[isEditing, open, meta, value, initialValue, columnName, rowData, setUpdate],
	);

	const onTextareaKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.key === "Escape") {
				event.preventDefault();
				console.log("onTextareaKeyDown", event.key, value, initialValue);
				onCancel();
			} else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				console.log("onTextareaKeyDown", event.key, value, initialValue);
				onSave();
			}
			// Stop propagation to prevent grid navigation
			event.stopPropagation();
		},
		[onCancel, onSave, value, initialValue],
	);

	const onTextareaBlur = useCallback(() => {
		// Update store on blur (don't auto-save, just track)
		if (value !== initialValue) {
			setUpdate(rowData, columnName, value, initialValue);
		}
		setOpen(false);
		meta?.onCellEditingStop?.();
	}, [meta, value, initialValue, columnName, rowData, setUpdate]);

	useEffect(() => {
		if (isEditing && !open) {
			setOpen(true);
		}
		if (
			isFocused &&
			!isEditing &&
			!meta?.searchOpen &&
			!meta?.isScrolling &&
			containerRef.current
		) {
			containerRef.current.focus();
		}
	}, [isFocused, isEditing, open, meta?.searchOpen, meta?.isScrolling]);

	useHotkeys("enter", () => onSave());
	useHotkeys("esc", () => onCancel());

	return (
		<Popover
			open={open}
			onOpenChange={onOpenChange}
		>
			<PopoverAnchor asChild>
				<DataGridCellWrapper
					ref={containerRef}
					cell={cell}
					table={table}
					rowIndex={rowIndex}
					columnId={columnId}
					isEditing={isEditing}
					isFocused={isFocused}
					isSelected={isSelected}
					onKeyDown={onWrapperKeyDown}
				>
					<span data-slot="grid-cell-content">{value}</span>
				</DataGridCellWrapper>
			</PopoverAnchor>
			<PopoverContent
				data-grid-cell-editor=""
				align="start"
				side="bottom"
				sideOffset={sideOffset}
				className="w-[400px] rounded-none p-0"
				onOpenAutoFocus={onOpenAutoFocus}
			>
				<Textarea
					ref={textareaRef}
					value={value}
					onChange={onChange}
					onKeyDown={onTextareaKeyDown}
					onBlur={onTextareaBlur}
					className="min-h-[150px] resize-none rounded-none border-0 shadow-none focus-visible:ring-0"
					placeholder="Enter text..."
				/>
				<div className="flex flex-col">
					<Button
						variant="ghost"
						size="sm"
						className="rounded-none justify-start text-xs"
					>
						<Kbd className="text-xs font-normal">⌘↵</Kbd>
						Save Changes
					</Button>

					<Button
						variant="ghost"
						size="sm"
						className="rounded-none justify-start text-xs"
					>
						<Kbd className="text-xs font-normal">Esc</Kbd>
						Cancel Changes
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function NumberCell<TData>({
	cell,
	table,
	rowIndex,
	columnId,
	isFocused,
	isEditing,
	isSelected,
}: CellVariantProps<TData>) {
	const initialValue = cell.getValue() as number;
	const [value, setValue] = useState(String(initialValue ?? ""));
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const meta = table.options.meta;

	const onBlur = useCallback(() => {
		const numValue = value === "" ? null : Number(value);
		if (numValue !== initialValue) {
			meta?.onDataUpdate?.({ rowIndex, columnId, value: numValue });
		}
		meta?.onCellEditingStop?.();
	}, [meta, rowIndex, columnId, initialValue, value]);

	const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		setValue(event.target.value);
	}, []);

	const onWrapperKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (isEditing) {
				if (event.key === "Enter") {
					event.preventDefault();
					const numValue = value === "" ? null : Number(value);
					if (numValue !== initialValue) {
						meta?.onDataUpdate?.({ rowIndex, columnId, value: numValue });
					}
					meta?.onCellEditingStop?.({ moveToNextRow: true });
				} else if (event.key === "Tab") {
					event.preventDefault();
					const numValue = value === "" ? null : Number(value);
					if (numValue !== initialValue) {
						meta?.onDataUpdate?.({ rowIndex, columnId, value: numValue });
					}
					meta?.onCellEditingStop?.({
						direction: event.shiftKey ? "left" : "right",
					});
				} else if (event.key === "Escape") {
					event.preventDefault();
					setValue(String(initialValue ?? ""));
					inputRef.current?.blur();
				}
			} else if (isFocused) {
				// Handle Backspace to start editing with empty value
				if (event.key === "Backspace") {
					setValue("");
				} else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
					// Handle typing to pre-fill the value when editing starts
					setValue(event.key);
				}
			}
		},
		[isEditing, isFocused, initialValue, meta, rowIndex, columnId, value],
	);

	useEffect(() => {
		setValue(String(initialValue ?? ""));
	}, [initialValue]);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
		if (
			isFocused &&
			!isEditing &&
			!meta?.searchOpen &&
			!meta?.isScrolling &&
			containerRef.current
		) {
			containerRef.current.focus();
		}
	}, [isFocused, isEditing, meta?.searchOpen, meta?.isScrolling]);

	return (
		<DataGridCellWrapper
			ref={containerRef}
			cell={cell}
			table={table}
			rowIndex={rowIndex}
			columnId={columnId}
			isEditing={isEditing}
			isFocused={isFocused}
			isSelected={isSelected}
			onKeyDown={onWrapperKeyDown}
		>
			{isEditing ? (
				<input
					ref={inputRef}
					type="number"
					value={value}
					onBlur={onBlur}
					onChange={onChange}
					className="w-full border-none bg-transparent p-0 outline-none"
				/>
			) : (
				<span data-slot="grid-cell-content">{value}</span>
			)}
		</DataGridCellWrapper>
	);
}

export function SelectCell<TData>({
	cell,
	table,
	rowIndex,
	columnId,
	isFocused,
	isEditing,
	isSelected,
}: CellVariantProps<TData>) {
	const initialValue = cell.getValue() as string;
	const [value, setValue] = useState(initialValue);
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const meta = table.options.meta;
	const cellOpts = cell.column.columnDef.meta?.cell;
	const options = cellOpts?.variant === "select" ? cellOpts.options : [];

	const onValueChange = useCallback(
		(newValue: string) => {
			setValue(newValue);
			meta?.onDataUpdate?.({ rowIndex, columnId, value: newValue });
			meta?.onCellEditingStop?.();
		},
		[meta, rowIndex, columnId],
	);

	const onOpenChange = useCallback(
		(isOpen: boolean) => {
			setOpen(isOpen);
			if (!isOpen) {
				meta?.onCellEditingStop?.();
			}
		},
		[meta],
	);

	const onWrapperKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (isEditing) {
				if (event.key === "Escape") {
					event.preventDefault();
					setValue(initialValue);
					setOpen(false);
					meta?.onCellEditingStop?.();
				} else if (event.key === "Tab") {
					event.preventDefault();
					setOpen(false);
					meta?.onCellEditingStop?.({
						direction: event.shiftKey ? "left" : "right",
					});
				}
			}
		},
		[isEditing, initialValue, meta],
	);

	useEffect(() => {
		setValue(initialValue);
	}, [initialValue]);

	useEffect(() => {
		if (isEditing && !open) {
			setOpen(true);
		}
		if (
			isFocused &&
			!isEditing &&
			!meta?.searchOpen &&
			!meta?.isScrolling &&
			containerRef.current
		) {
			containerRef.current.focus();
		}
	}, [isFocused, isEditing, open, meta?.searchOpen, meta?.isScrolling]);

	const displayLabel = options.find((opt) => opt.value === value)?.label ?? value;

	return (
		<DataGridCellWrapper
			ref={containerRef}
			cell={cell}
			table={table}
			rowIndex={rowIndex}
			columnId={columnId}
			isEditing={isEditing}
			isFocused={isFocused}
			isSelected={isSelected}
			onKeyDown={onWrapperKeyDown}
		>
			{isEditing ? (
				<Select
					value={value}
					onValueChange={onValueChange}
					open={open}
					onOpenChange={onOpenChange}
				>
					<SelectTrigger
						size="sm"
						className="size-full items-start border-none p-0 shadow-none focus-visible:ring-0 dark:bg-transparent [&_svg]:hidden"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent
						data-grid-cell-editor=""
						// compensate for the wrapper padding
						align="start"
						alignOffset={-8}
						sideOffset={-8}
						className="min-w-[calc(var(--radix-select-trigger-width)+16px)]"
					>
						{options.map((option) => (
							<SelectItem
								key={option.value}
								value={option.value}
							>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			) : (
				<span data-slot="grid-cell-content">{displayLabel}</span>
			)}
		</DataGridCellWrapper>
	);
}

export function CheckboxCell<TData>({
	cell,
	table,
	rowIndex,
	columnId,
	isFocused,
	isSelected,
}: CellVariantProps<TData>) {
	const initialValue = cell.getValue() as boolean;
	const [value, setValue] = useState(Boolean(initialValue));
	const containerRef = useRef<HTMLDivElement>(null);
	const meta = table.options.meta;

	const onCheckedChange = useCallback(
		(checked: boolean) => {
			setValue(checked);
			meta?.onDataUpdate?.({ rowIndex, columnId, value: checked });
		},
		[meta, rowIndex, columnId],
	);

	const onWrapperKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (isFocused && (event.key === " " || event.key === "Enter")) {
				event.preventDefault();
				event.stopPropagation();
				onCheckedChange(!value);
			}
		},
		[isFocused, value, onCheckedChange],
	);

	useEffect(() => {
		setValue(Boolean(initialValue));
	}, [initialValue]);

	useEffect(() => {
		if (isFocused && !meta?.searchOpen && !meta?.isScrolling && containerRef.current) {
			containerRef.current.focus();
		}
	}, [isFocused, meta?.searchOpen, meta?.isScrolling]);

	const onWrapperClick = useCallback(
		(event: MouseEvent) => {
			if (isFocused) {
				event.preventDefault();
				event.stopPropagation();
				onCheckedChange(!value);
			}
		},
		[isFocused, value, onCheckedChange],
	);

	const onCheckboxClick = useCallback((event: MouseEvent) => {
		event.stopPropagation();
	}, []);

	const onCheckboxMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
	}, []);

	const onCheckboxDoubleClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
	}, []);

	return (
		<DataGridCellWrapper
			ref={containerRef}
			cell={cell}
			table={table}
			rowIndex={rowIndex}
			columnId={columnId}
			isEditing={false}
			isFocused={isFocused}
			isSelected={isSelected}
			onClick={onWrapperClick}
			onKeyDown={onWrapperKeyDown}
			className="flex size-full justify-center"
		>
			<Checkbox
				checked={value}
				onCheckedChange={onCheckedChange}
				onClick={onCheckboxClick}
				onMouseDown={onCheckboxMouseDown}
				onDoubleClick={onCheckboxDoubleClick}
				className="border-primary"
			/>
		</DataGridCellWrapper>
	);
}
