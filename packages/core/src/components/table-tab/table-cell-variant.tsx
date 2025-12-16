"use client";
import type { Cell, Table } from "@tanstack/react-table";
import {
	type ChangeEvent,
	type ComponentProps,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { TableCellWrapper } from "@/components/table-tab/table-cell-wrapper";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateCellStore } from "@/stores/update-cell-store";
import type { TableRecord } from "@/types/table.type";
import { Input } from "../ui/input";

interface CellVariantProps<TData> {
	cell: Cell<TData, unknown>;
	table: Table<TableRecord>;
	rowIndex: number;
	columnId: string;
	isEditing: boolean;
	isFocused: boolean;
	isSelected: boolean;
}

export const TableTextCell = ({
	cell,
	table,
	rowIndex,
	columnId,
	isEditing,
	isFocused,
	isSelected,
}: CellVariantProps<TableRecord>) => {
	const { setUpdate, clearUpdate } = useUpdateCellStore();
	const initialValue = cell.getValue() as string;

	// Initialize state with initialValue
	const [value, setValue] = useState(() => initialValue ?? "");
	const [open, setOpen] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const meta = table.options.meta;

	// Get the row data and column name for store operations
	const rowData = cell.row.original as Record<string, unknown>;
	const columnName = columnId;

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
		[columnName, value, initialValue, rowData, setUpdate],
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

	// Sync open state with isEditing prop
	if (isEditing && !open) {
		setOpen(true);
	}

	useEffect(() => {
		if (isFocused && !isEditing && !meta?.isScrolling && containerRef.current) {
			containerRef.current.focus();
		}
	}, [isFocused, isEditing, meta?.isScrolling]);

	useHotkeys("enter", () => onSave());
	useHotkeys("esc", () => onCancel());

	return (
		<Popover
			open={open}
			onOpenChange={onOpenChange}
		>
			<PopoverAnchor asChild>
				<TableCellWrapper
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
				</TableCellWrapper>
			</PopoverAnchor>
			<PopoverContent
				data-grid-cell-editor=""
				align="start"
				side="bottom"
				sideOffset={0}
				className="w-[400px] rounded-none p-0 gap-0"
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
				<div className="flex flex-col border-t">
					<Button
						variant="ghost"
						size="sm"
						className="rounded-none justify-start text-xs py-4 px-2"
					>
						<Kbd className="text-xs font-normal">⌘↵</Kbd>
						<span className="ml-1 text-xs">Save Changes</span>
					</Button>

					<Button
						variant="ghost"
						size="sm"
						className="rounded-none justify-start text-xs py-4 px-2"
					>
						<Kbd className="text-xs font-normal">esc</Kbd>
						<span className="ml-1 text-xs">Cancel Changes</span>
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};

export const TableNumberCell = ({
	cell,
	table,
	rowIndex,
	columnId,
	isEditing,
	isFocused,
	isSelected,
}: CellVariantProps<TableRecord>) => {
	const { setUpdate, clearUpdate } = useUpdateCellStore();
	const initialValue = cell.getValue() as number;

	// Initialize state with initialValue
	const [value, setValue] = useState(() => initialValue);
	const [open, setOpen] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const meta = table.options.meta;
	const enumValues = cell.column.columnDef.meta?.enumValues as string[] | undefined;
	console.log({ enumValues: enumValues });

	// Get the row data and column name for store operations
	const rowData = cell.row.original as Record<string, unknown>;
	const columnName = columnId;

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
		setValue(initialValue);

		// Clear this cell's update from the store
		clearUpdate(rowData, columnName);

		setOpen(false);
		meta?.onCellEditingStop?.();
	}, [meta, initialValue, columnName, rowData, clearUpdate, value]);

	const onChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const newValue = event.target.value;
			console.log("onChange", newValue, columnName, value, initialValue);
			setValue(Number(newValue));

			// Debounced update to store (tracks the change but doesn't save)
			setUpdate(rowData, columnName, Number(newValue), initialValue);
		},
		[columnName, value, initialValue, rowData, setUpdate],
	);

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

	const onTextInputKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Escape") {
				event.preventDefault();
				console.log("onTextInputKeyDown", event.key, value, initialValue);
				onCancel();
			} else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				console.log("onTextInputKeyDown", event.key, value, initialValue);
				onSave();
			}
			// Stop propagation to prevent grid navigation
			event.stopPropagation();
		},
		[onCancel, onSave, value, initialValue],
	);

	const onTextInputBlur = useCallback(() => {
		// Update store on blur (don't auto-save, just track)
		if (value !== initialValue) {
			setUpdate(rowData, columnName, value, initialValue);
		}
		setOpen(false);
		meta?.onCellEditingStop?.();
	}, [meta, value, initialValue, columnName, rowData, setUpdate]);

	// Sync open state with isEditing prop
	if (isEditing && !open) {
		setOpen(true);
	}

	useEffect(() => {
		if (isFocused && !isEditing && !meta?.isScrolling && containerRef.current) {
			containerRef.current.focus();
		}
	}, [isFocused, isEditing, meta?.isScrolling]);

	useHotkeys("enter", () => onSave());
	useHotkeys("esc", () => onCancel());

	return (
		<TableCellWrapper
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
			<Input
				type="number"
				ref={inputRef}
				value={value || ""}
				onChange={(event) => onChange(event as ChangeEvent<HTMLInputElement>)}
				onKeyDown={(event) =>
					onTextInputKeyDown(event as KeyboardEvent<HTMLInputElement>)
				}
				onBlur={onTextInputBlur}
				className="size-full rounded-none border-none p-0 shadow-none hover:bg-transparent! focus-visible:ring-0 dark:bg-transparent [&_svg]:hidden"
			/>
		</TableCellWrapper>
	);
};

export const TableBooleanCell = ({
	cell,
	table,
	rowIndex,
	columnId,
	isEditing,
	isFocused,
	isSelected,
}: CellVariantProps<TableRecord>) => {
	const { setUpdate, clearUpdate, getUpdate } = useUpdateCellStore();
	const initialValue = cell.getValue() as boolean | null;
	const [selectOpen, setSelectOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const selectTriggerRef = useRef<HTMLButtonElement>(null);
	const isEditingRef = useRef(isEditing);
	const meta = table.options.meta;

	// Update ref when isEditing changes
	useEffect(() => {
		isEditingRef.current = isEditing;
	}, [isEditing]);

	// Get the row data and column name for store operations
	const rowData = cell.row.original as Record<string, unknown>;
	const columnName = columnId;

	// Get the current value from store or use initial value
	const pendingUpdate = getUpdate(rowData, columnName);
	const currentValue = pendingUpdate
		? (pendingUpdate.newValue as boolean | null)
		: initialValue;

	// Convert boolean value to string for the select component
	const value = useMemo(() => {
		if (currentValue === null || currentValue === undefined) return "null";
		return currentValue ? "true" : "false";
	}, [currentValue]);

	const onValueChange = useCallback(
		(newValue: string) => {
			// Convert string value back to boolean or null
			let boolValue: boolean | null;
			if (newValue === "null") {
				boolValue = null;
			} else {
				boolValue = newValue === "true";
			}

			// Update the store when value changes
			setUpdate(rowData, columnName, boolValue, initialValue);

			// Close the select and stop editing
			setSelectOpen(false);
			meta?.onCellEditingStop?.();
		},
		[columnName, rowData, initialValue, setUpdate, meta],
	);

	const onCancel = useCallback(() => {
		// Clear any pending updates (reverts to initial value)
		clearUpdate(rowData, columnName);

		// Close select and stop editing
		setSelectOpen(false);
		meta?.onCellEditingStop?.();
	}, [rowData, columnName, clearUpdate, meta]);

	const onOpenChange = useCallback(
		(open: boolean) => {
			setSelectOpen(open);

			// If closing the select, stop editing (but keep the value in store)
			if (!open && isEditing) {
				meta?.onCellEditingStop?.();
			}
		},
		[isEditing, meta],
	);

	const onWrapperKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (isEditing && !selectOpen) {
				if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
				} else if (event.key === "Tab") {
					event.preventDefault();
					onCancel();
					meta?.onCellEditingStop?.({
						direction: event.shiftKey ? "left" : "right",
					});
				}
			}
		},
		[isEditing, selectOpen, meta, onCancel],
	);

	// Auto-open select when entering edit mode, close when exiting
	useEffect(() => {
		if (isEditing) {
			// Open the select and trigger click
			const openTimer = setTimeout(() => {
				if (isEditingRef.current) {
					setSelectOpen(true);
					// Small delay to ensure the trigger is rendered
					setTimeout(() => {
						if (isEditingRef.current) {
							selectTriggerRef.current?.click();
						}
					}, 0);
				}
			}, 0);
			return () => {
				clearTimeout(openTimer);
				// Cleanup: close select when component unmounts or isEditing changes
				setSelectOpen(false);
			};
		}
	}, [isEditing]);

	useEffect(() => {
		if (isFocused && !isEditing && !meta?.isScrolling && containerRef.current) {
			containerRef.current.focus();
		}
	}, [isFocused, isEditing, meta?.isScrolling]);

	// Display value (use currentValue which includes store updates)
	const displayValue =
		currentValue === null || currentValue === undefined
			? "NULL"
			: currentValue
				? "true"
				: "false";

	return (
		<TableCellWrapper
			ref={containerRef}
			cell={cell}
			table={table}
			rowIndex={rowIndex}
			columnId={columnId}
			isEditing={isEditing}
			isFocused={isFocused}
			isSelected={isSelected}
			onKeyDown={onWrapperKeyDown}
			className="p-0!"
		>
			{isEditing ? (
				<Select
					value={value}
					onValueChange={onValueChange}
					open={selectOpen}
					onOpenChange={onOpenChange}
				>
					<SelectTrigger
						ref={selectTriggerRef}
						className="size-full px-2 py-1.5 rounded-none border-none p-0 shadow-none hover:bg-transparent! focus-visible:ring-0 dark:bg-transparent [&_svg]:hidden"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent
						data-grid-cell-editor=""
						alignOffset={-8}
						sideOffset={-8}
						className="min-w-[calc(var(--radix-select-trigger-width)+16px)]"
						onEscapeKeyDown={onCancel}
						onPointerDownOutside={(e) => {
							// Close the select and keep the value
							e.preventDefault();
							setSelectOpen(false);
							meta?.onCellEditingStop?.();
						}}
					>
						<SelectItem value="true">true</SelectItem>
						<SelectItem value="false">false</SelectItem>
						<SelectItem value="null">NULL</SelectItem>
					</SelectContent>
				</Select>
			) : (
				<span className="flex items-center size-full px-2 py-1.5">{displayValue}</span>
			)}
		</TableCellWrapper>
	);
};

export const TableEnumCell = ({
	cell,
	table,
	rowIndex,
	columnId,
	isEditing,
	isFocused,
	isSelected,
}: CellVariantProps<TableRecord>) => {
	const { setUpdate, clearUpdate, getUpdate } = useUpdateCellStore();
	const initialValue = cell.getValue() as string | null;
	const [selectOpen, setSelectOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const selectTriggerRef = useRef<HTMLButtonElement>(null);
	const isEditingRef = useRef(isEditing);
	const meta = table.options.meta;
	const enumValues = cell.column.columnDef.meta?.enumValues as string[] | undefined;
	console.log(cell.column.columnDef.meta.enumValues);

	console.log(table.options.meta);

	// Update ref when isEditing changes
	useEffect(() => {
		isEditingRef.current = isEditing;
	}, [isEditing]);

	// Get the row data and column name for store operations
	const rowData = cell.row.original as Record<string, unknown>;
	const columnName = columnId;

	// Get the current value from store or use initial value
	const pendingUpdate = getUpdate(rowData, columnName);
	const currentValue = pendingUpdate
		? (pendingUpdate.newValue as string | null)
		: initialValue;

	const onValueChange = useCallback(
		(newValue: string) => {
			// Convert "null" string to actual null, otherwise use the enum value
			const enumValue: string | null = newValue === "null" ? null : newValue;
			setUpdate(rowData, columnName, enumValue, initialValue);
			setSelectOpen(false);
			meta?.onCellEditingStop?.();
		},
		[columnName, rowData, initialValue, setUpdate, meta],
	);

	const onCancel = useCallback(() => {
		// Clear any pending updates (reverts to initial value)
		clearUpdate(rowData, columnName);

		// Close select and stop editing
		setSelectOpen(false);
		meta?.onCellEditingStop?.();
	}, [rowData, columnName, clearUpdate, meta]);

	const onOpenChange = useCallback(
		(open: boolean) => {
			setSelectOpen(open);

			// If closing the select, stop editing (but keep the value in store)
			if (!open && isEditing) {
				meta?.onCellEditingStop?.();
			}
		},
		[isEditing, meta],
	);

	const onWrapperKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (isEditing && !selectOpen) {
				if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
				} else if (event.key === "Tab") {
					event.preventDefault();
					onCancel();
					meta?.onCellEditingStop?.({
						direction: event.shiftKey ? "left" : "right",
					});
				}
			}
		},
		[isEditing, selectOpen, meta, onCancel],
	);

	// Auto-open select when entering edit mode, close when exiting
	useEffect(() => {
		if (isEditing) {
			// Open the select and trigger click
			const openTimer = setTimeout(() => {
				if (isEditingRef.current) {
					setSelectOpen(true);
					// Small delay to ensure the trigger is rendered
					setTimeout(() => {
						if (isEditingRef.current) {
							selectTriggerRef.current?.click();
						}
					}, 0);
				}
			}, 0);
			return () => {
				clearTimeout(openTimer);
				// Cleanup: close select when component unmounts or isEditing changes
				setSelectOpen(false);
			};
		}
	}, [isEditing]);

	useEffect(() => {
		if (isFocused && !isEditing && !meta?.isScrolling && containerRef.current) {
			containerRef.current.focus();
		}
	}, [isFocused, isEditing, meta?.isScrolling]);

	// Display value (use currentValue which includes store updates)
	const displayValue =
		currentValue === null || currentValue === undefined ? "NULL" : currentValue;

	return (
		<TableCellWrapper
			ref={containerRef}
			cell={cell}
			table={table}
			rowIndex={rowIndex}
			columnId={columnId}
			isEditing={isEditing}
			isFocused={isFocused}
			isSelected={isSelected}
			onKeyDown={onWrapperKeyDown}
			className="p-0!"
		>
			{isEditing ? (
				<Select
					value={currentValue === null ? "null" : currentValue}
					onValueChange={onValueChange}
					open={selectOpen}
					onOpenChange={onOpenChange}
				>
					<SelectTrigger
						ref={selectTriggerRef}
						className="size-full px-2 py-1.5 rounded-none border-none p-0 shadow-none hover:bg-transparent! focus-visible:ring-0 dark:bg-transparent [&_svg]:hidden"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent
						data-grid-cell-editor=""
						alignOffset={-8}
						sideOffset={-8}
						className="min-w-[calc(var(--radix-select-trigger-width)+16px)]"
						onEscapeKeyDown={onCancel}
						onPointerDownOutside={(e) => {
							// Close the select and keep the value
							e.preventDefault();
							setSelectOpen(false);
							meta?.onCellEditingStop?.();
						}}
					>
						{enumValues?.map((enumValue) => (
							<SelectItem
								key={enumValue}
								value={enumValue}
							>
								{enumValue}
							</SelectItem>
						))}
						<SelectItem value="null">NULL</SelectItem>
					</SelectContent>
				</Select>
			) : (
				<span className="flex items-center size-full px-2 py-1.5 truncate">
					{displayValue}
				</span>
			)}
		</TableCellWrapper>
	);
};
