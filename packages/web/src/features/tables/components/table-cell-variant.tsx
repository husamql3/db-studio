"use client";
import { Badge } from "@db-studio/ui/badge";
import { Button } from "@db-studio/ui/button";
import { DatePicker } from "@db-studio/ui/date-picker";
import { Drawer, DrawerContent } from "@db-studio/ui/drawer";
import { Input } from "@db-studio/ui/input";
import { Kbd } from "@db-studio/ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "@db-studio/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { Textarea } from "@db-studio/ui/textarea";
import { cn } from "@db-studio/ui/utils";
import type { Cell, Table } from "@tanstack/react-table";
import { format } from "date-fns";
import {
	type ChangeEvent,
	type ComponentProps,
	type KeyboardEvent,
	lazy,
	memo,
	type ReactElement,
	type ReactNode,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import type { TableRecord } from "@/types/table.type";
import { formatCellValue } from "@/utils/format-cell-value";
import { useUpdateCellStore } from "../stores/update-cell.store";
import { FkDrawerContent } from "./fk-drawer-content";
import { TableCellWrapper } from "./table-cell-wrapper";

// Monaco is several megabytes; load it when a JSON cell is first edited, not with the grid.
const JsonEditor = lazy(() =>
	import("./json-editor").then((module) => ({ default: module.JsonEditor })),
);

/**
 * A cell's editor popover, mounted the first time the cell is edited. Until then only the anchor
 * renders: a page holds hundreds of cells, and an idle Radix popover in each was a large share
 * of the grid's render time. Once mounted it stays, so closing still animates.
 */
const CellPopover = ({
	active,
	open,
	onOpenChange,
	anchor,
	children,
}: {
	active: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	anchor: ReactElement;
	children: ReactNode;
}) => {
	const [mounted, setMounted] = useState(active);
	if (active && !mounted) setMounted(true);
	if (!mounted) return anchor;
	return (
		<Popover
			open={open}
			onOpenChange={onOpenChange}
		>
			<PopoverAnchor asChild>{anchor}</PopoverAnchor>
			{children}
		</Popover>
	);
};

interface CellVariantProps<TData> {
	cell: Cell<TData, unknown>;
	table: Table<TableRecord>;
	rowIndex: number;
	columnId: string;
	isEditing: boolean;
	isFocused: boolean;
	isSelected: boolean;
}

export const TableTextCell = memo(
	({
		cell,
		table,
		rowIndex,
		columnId,
		isEditing,
		isFocused,
		isSelected,
	}: CellVariantProps<TableRecord>) => {
		const { setUpdate, clearUpdate, getUpdate } = useUpdateCellStore();
		const rawInitialValue = cell.getValue();
		const initialValue = formatCellValue(rawInitialValue);

		// Separate editor value from display value
		const [editorValue, setEditorValue] = useState(() => initialValue ?? "");
		const [open, setOpen] = useState(false);
		const textareaRef = useRef<HTMLTextAreaElement>(null);
		const containerRef = useRef<HTMLDivElement>(null);
		const meta = table.options.meta;

		// Get the row data and column name for store operations
		const rowData = cell.row.original as Record<string, unknown>;
		const columnName = columnId;

		// Get the current display value from store or use initial value
		const pendingUpdate = getUpdate(rowData, columnName, table.options.meta?.editScope);
		const displayValue = pendingUpdate
			? formatCellValue(pendingUpdate.newValue)
			: (initialValue ?? "");

		const onSave = useCallback(() => {
			// Update the store with the final value
			setUpdate(
				rowData,
				columnName,
				editorValue,
				rawInitialValue,
				table.options.meta?.editScope,
			);

			// Stop editing first, then close the popover
			meta?.onCellEditingStop?.();
			setOpen(false);
		}, [meta, editorValue, rawInitialValue, initialValue, columnName, rowData, setUpdate]);

		const onCancel = useCallback(() => {
			// Restore the original value
			setEditorValue(initialValue ?? "");

			// Clear this cell's update from the store
			clearUpdate(rowData, columnName, table.options.meta?.editScope);

			// Stop editing first, then close the popover
			meta?.onCellEditingStop?.();
			setOpen(false);
		}, [meta, initialValue, columnName, rowData, clearUpdate, editorValue]);

		const onChange = useCallback(
			(event: ChangeEvent<HTMLTextAreaElement>) => {
				const newValue = event.target.value;
				setEditorValue(newValue);
			},
			[columnName, editorValue, initialValue],
		);

		const onOpenChange = useCallback(
			(isOpen: boolean) => {
				setOpen(isOpen);
				if (!isOpen) {
					// When closing, update the store with current value if changed
					if (editorValue !== initialValue) {
						setUpdate(
							rowData,
							columnName,
							editorValue,
							initialValue,
							table.options.meta?.editScope,
						);
					}
					meta?.onCellEditingStop?.();
				}
			},
			[meta, editorValue, initialValue, columnName, rowData, setUpdate],
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
						meta?.onCellEditingStop?.({
							direction: event.shiftKey ? "left" : "right",
						});
					}
				}
			},
			[isEditing, open, meta],
		);

		const onTextareaKeyDown = useCallback(
			(event: KeyboardEvent<HTMLTextAreaElement>) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
				} else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
					event.preventDefault();
					onSave();
				}
				// Stop propagation to prevent grid navigation
				event.stopPropagation();
			},
			[onCancel, onSave, editorValue, initialValue],
		);

		const onTextareaBlur = useCallback(() => {
			// Update store on blur
			if (editorValue !== initialValue) {
				setUpdate(
					rowData,
					columnName,
					editorValue,
					initialValue,
					table.options.meta?.editScope,
				);
			}
			// Stop editing first, then close the popover
			meta?.onCellEditingStop?.();
			setOpen(false);
		}, [meta, editorValue, initialValue, columnName, rowData, setUpdate]);

		// Sync open state with isEditing prop and initialize editor value
		useEffect(() => {
			if (isEditing && !open) {
				setEditorValue(displayValue);
				setOpen(true);
			} else if (!isEditing && open) {
				setOpen(false);
			}
		}, [isEditing, open, displayValue]);

		useEffect(() => {
			if (isFocused && !isEditing && !meta?.isScrolling && containerRef.current) {
				containerRef.current.focus();
			}
		}, [isFocused, isEditing, meta?.isScrolling]);

		useHotkeys("enter", () => onSave(), { enabled: open });
		useHotkeys("esc", () => onCancel(), { enabled: open });

		return (
			<CellPopover
				active={open || isEditing}
				open={open}
				onOpenChange={onOpenChange}
				anchor={
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
						<span data-slot="grid-cell-content">{displayValue}</span>
					</TableCellWrapper>
				}
			>
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
						value={editorValue}
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
			</CellPopover>
		);
	},
);

TableTextCell.displayName = "TableTextCell";

export const TableNumberCell = memo(
	({
		cell,
		table,
		rowIndex,
		columnId,
		isEditing,
		isFocused,
		isSelected,
	}: CellVariantProps<TableRecord>) => {
		const { setUpdate, clearUpdate, getUpdate } = useUpdateCellStore();
		const initialValue = cell.getValue() as number;
		const meta = table.options.meta;

		// Get the row data and column name for store operations
		const rowData = cell.row.original as Record<string, unknown>;
		const columnName = columnId;

		// A pending edit wins over the server value, also after a refetch (e.g. Live mode).
		const pendingUpdate = getUpdate(rowData, columnName, meta?.editScope);
		const displayValue = pendingUpdate ? (pendingUpdate.newValue as number) : initialValue;

		// The input exists only while the cell is edited; a page holds hundreds of number cells.
		const [value, setValue] = useState(displayValue);
		const [open, setOpen] = useState(false);
		const containerRef = useRef<HTMLDivElement>(null);

		// Follow the grid's editing state, starting each edit from the value the cell shows.
		if (isEditing !== open) {
			if (isEditing) setValue(displayValue);
			setOpen(isEditing);
		}

		const onSave = useCallback(() => {
			// Update the store with the final value
			setUpdate(rowData, columnName, value, initialValue, table.options.meta?.editScope);

			// Close the editor
			setOpen(false);
			meta?.onCellEditingStop?.();
		}, [meta, value, initialValue, columnName, rowData, setUpdate]);

		const onCancel = useCallback(() => {
			// Restore the original value
			setValue(initialValue);

			// Clear this cell's update from the store
			clearUpdate(rowData, columnName, table.options.meta?.editScope);

			setOpen(false);
			meta?.onCellEditingStop?.();
		}, [meta, initialValue, columnName, rowData, clearUpdate, value]);

		const onChange = useCallback(
			(event: ChangeEvent<HTMLInputElement>) => {
				const newValue = event.target.value;
				setValue(Number(newValue));

				// Debounced update to store (tracks the change but doesn't save)
				setUpdate(
					rowData,
					columnName,
					Number(newValue),
					initialValue,
					table.options.meta?.editScope,
				);
			},
			[columnName, value, initialValue, rowData, setUpdate],
		);

		const onTextInputKeyDown = useCallback(
			(event: KeyboardEvent<HTMLInputElement>) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
				} else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
					event.preventDefault();
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
				setUpdate(rowData, columnName, value, initialValue, table.options.meta?.editScope);
			}
			setOpen(false);
			meta?.onCellEditingStop?.();
		}, [meta, value, initialValue, columnName, rowData, setUpdate]);

		// Focus the input as it mounts, with the caret after the current value.
		const focusInput = useCallback((input: HTMLInputElement | null) => {
			if (!input) return;
			input.focus();
			// Number inputs have no selection API; resetting the value moves the caret to the end.
			const current = input.value;
			input.value = "";
			input.value = current;
		}, []);

		useEffect(() => {
			if (isFocused && !isEditing && !meta?.isScrolling && containerRef.current) {
				containerRef.current.focus();
			}
		}, [isFocused, isEditing, meta?.isScrolling]);

		useHotkeys("enter", () => onSave(), { enabled: open });
		useHotkeys("esc", () => onCancel(), { enabled: open });

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
			>
				{open ? (
					<Input
						type="number"
						variant="outline"
						ref={focusInput}
						value={value ?? ""}
						onChange={(event) => onChange(event as ChangeEvent<HTMLInputElement>)}
						onKeyDown={(event) => onTextInputKeyDown(event as KeyboardEvent<HTMLInputElement>)}
						onBlur={onTextInputBlur}
						className="size-full rounded-none border-none p-0 shadow-none hover:bg-transparent! focus-visible:ring-0 bg-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
					/>
				) : (
					<span data-slot="grid-cell-content">{formatCellValue(displayValue)}</span>
				)}
			</TableCellWrapper>
		);
	},
);

TableNumberCell.displayName = "TableNumberCell";

export const TableBooleanCell = memo(
	({
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
		const pendingUpdate = getUpdate(rowData, columnName, table.options.meta?.editScope);
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
				setUpdate(rowData, columnName, boolValue, initialValue, table.options.meta?.editScope);

				// Close the select and stop editing
				setSelectOpen(false);
				meta?.onCellEditingStop?.();
			},
			[columnName, rowData, initialValue, setUpdate, meta],
		);

		const onCancel = useCallback(() => {
			// Clear any pending updates (reverts to initial value)
			clearUpdate(rowData, columnName, table.options.meta?.editScope);

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
							variant="outline"
							className="size-full px-2 py-1.5 rounded-none border-none p-0 shadow-none hover:bg-transparent! focus-visible:ring-0 bg-transparent [&_svg]:hidden"
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
	},
);

TableBooleanCell.displayName = "TableBooleanCell";

export const TableEnumCell = memo(
	({
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

		// Update ref when isEditing changes
		useEffect(() => {
			isEditingRef.current = isEditing;
		}, [isEditing]);

		// Get the row data and column name for store operations
		const rowData = cell.row.original as Record<string, unknown>;
		const columnName = columnId;

		// Get the current value from store or use initial value
		const pendingUpdate = getUpdate(rowData, columnName, table.options.meta?.editScope);
		const currentValue = pendingUpdate
			? (pendingUpdate.newValue as string | null)
			: initialValue;

		const onValueChange = useCallback(
			(newValue: string) => {
				// Convert "null" string to actual null, otherwise use the enum value
				const enumValue: string | null = newValue === "null" ? null : newValue;
				setUpdate(rowData, columnName, enumValue, initialValue, table.options.meta?.editScope);
				setSelectOpen(false);
				meta?.onCellEditingStop?.();
			},
			[columnName, rowData, initialValue, setUpdate, meta],
		);

		const onCancel = useCallback(() => {
			// Clear any pending updates (reverts to initial value)
			clearUpdate(rowData, columnName, table.options.meta?.editScope);

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
							variant="outline"
							className="size-full px-2 py-1.5 rounded-none border-none p-0 shadow-none hover:bg-transparent! focus-visible:ring-0 bg-transparent [&_svg]:hidden"
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
	},
);

TableEnumCell.displayName = "TableEnumCell";

export const TableDateCell = memo(
	({
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
		const containerRef = useRef<HTMLDivElement>(null);
		const meta = table.options.meta;

		// Get the row data and column name for store operations
		const rowData = cell.row.original as Record<string, unknown>;
		const columnName = columnId;

		// Get the current value from store or use initial value
		const pendingUpdate = getUpdate(rowData, columnName, table.options.meta?.editScope);
		const currentValue = pendingUpdate
			? (pendingUpdate.newValue as string | null)
			: initialValue;

		const onDateChange = useCallback(
			(date: Date | null | undefined) => {
				// Convert Date to ISO string for storage (or null if undefined)
				const dateString = date ? date.toISOString() : null;
				setUpdate(
					rowData,
					columnName,
					dateString,
					initialValue,
					table.options.meta?.editScope,
				);

				// Close the date picker and stop editing
				meta?.onCellEditingStop?.();
			},
			[columnName, initialValue, rowData, setUpdate, meta],
		);

		const onCancel = useCallback(() => {
			// Clear any pending updates (reverts to initial value)
			clearUpdate(rowData, columnName, table.options.meta?.editScope);

			// Stop editing
			meta?.onCellEditingStop?.();
		}, [rowData, columnName, clearUpdate, meta, currentValue, initialValue]);

		const onWrapperKeyDown = useCallback(
			(event: KeyboardEvent<HTMLDivElement>) => {
				if (isEditing) {
					if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
					} else if (event.key === "Tab") {
						event.preventDefault();
						onCancel();
					}
				}
			},
			[isEditing, onCancel],
		);

		const onPickerOpenChange = useCallback(
			(open: boolean) => {
				if (!open) meta?.onCellEditingStop?.();
			},
			[meta],
		);

		useEffect(() => {
			if (isFocused && !isEditing && !meta?.isScrolling && containerRef.current) {
				containerRef.current.focus();
			}
		}, [isFocused, isEditing, meta?.isScrolling]);

		const date = currentValue ? new Date(currentValue) : undefined;

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
				className={isEditing ? "p-0!" : undefined}
			>
				{/* The picker exists only while the cell is edited; a page holds hundreds of date
				cells, and a single click only focuses a cell, as everywhere else. */}
				{isEditing ? (
					<DatePicker
						isFormatted={false}
						icon={false}
						value={date}
						onChange={onDateChange}
						open
						onOpenChange={onPickerOpenChange}
						placeholder="Pick a date"
						className="size-full px-2! py-1.5! rounded-none border-none p-0 text-sm shadow-none hover:bg-transparent! focus-visible:ring-0 bg-transparent dark:bg-transparent! [&_svg]:hidden"
					/>
				) : (
					// The text the picker's button shows.
					<span
						data-slot="grid-cell-content"
						className={cn(!date && "text-muted-foreground")}
					>
						{date && !Number.isNaN(date.getTime())
							? format(date, "yyyy-MM-dd")
							: "Pick a date"}
					</span>
				)}
			</TableCellWrapper>
		);
	},
);

TableDateCell.displayName = "TableDateCell";

export const TableJsonCell = memo(
	({
		cell,
		table,
		rowIndex,
		columnId,
		isEditing,
		isFocused,
		isSelected,
	}: CellVariantProps<TableRecord>) => {
		const { setUpdate, clearUpdate, getUpdate } = useUpdateCellStore();
		const { editor: editorPreferences } = usePersonalPreferencesStore();
		const rawValue = cell.getValue();

		// If the value is a string (which shouldn't happen but might due to pg driver issues),
		// parse it to an object
		let initialValue: Record<string, unknown>;
		if (typeof rawValue === "string") {
			try {
				initialValue = JSON.parse(rawValue) as Record<string, unknown>;
				console.warn(
					`TableJsonCell ${columnId}: initialValue was a string, parsed it to object`,
					initialValue,
				);
			} catch (e) {
				console.error(
					`TableJsonCell ${columnId}: Failed to parse initialValue string`,
					rawValue,
					e,
				);
				initialValue = {};
			}
		} else {
			initialValue = rawValue as Record<string, unknown>;
		}

		// Separate editor value (formatted) from display value (compact)
		const [editorValue, setEditorValue] = useState(
			() => JSON.stringify(initialValue, null, editorPreferences.tabSize) ?? "",
		);
		const [open, setOpen] = useState(false);
		const containerRef = useRef<HTMLDivElement>(null);
		const meta = table.options.meta;

		// Get the row data and column name for store operations
		const rowData = cell.row.original as Record<string, unknown>;
		const columnName = columnId;

		// Get the current display value from store or use initial value (compact format)
		const pendingUpdate = getUpdate(rowData, columnName, table.options.meta?.editScope);
		const currentJsonValue = pendingUpdate
			? (pendingUpdate.newValue as Record<string, unknown>)
			: initialValue;
		const displayValue = JSON.stringify(currentJsonValue);

		const parseError = useMemo(() => {
			try {
				JSON.parse(editorValue);
				return null;
			} catch (error) {
				return error instanceof Error ? error.message : "Invalid JSON";
			}
		}, [editorValue]);

		// Push the edited value into the store, or drop the pending update when it
		// matches the original value. Returns false when the JSON can't be parsed.
		const commit = useCallback(() => {
			let parsedValue: unknown;
			try {
				parsedValue = JSON.parse(editorValue);
			} catch {
				return false;
			}

			if (JSON.stringify(parsedValue) === JSON.stringify(initialValue)) {
				clearUpdate(rowData, columnName, table.options.meta?.editScope);
			} else {
				setUpdate(
					rowData,
					columnName,
					parsedValue,
					initialValue,
					table.options.meta?.editScope,
				);
			}
			return true;
		}, [editorValue, initialValue, columnName, rowData, setUpdate, clearUpdate]);

		const onSave = useCallback(() => {
			if (!commit()) return;

			// Stop editing first, then close the popover
			meta?.onCellEditingStop?.();
			setOpen(false);
		}, [commit, meta]);

		const onCancel = useCallback(() => {
			// Restore the original value (formatted)
			setEditorValue(JSON.stringify(initialValue, null, editorPreferences.tabSize) ?? "");

			// Clear this cell's update from the store
			clearUpdate(rowData, columnName, table.options.meta?.editScope);

			// Stop editing first, then close the popover
			meta?.onCellEditingStop?.();
			setOpen(false);
		}, [meta, initialValue, columnName, rowData, clearUpdate, editorPreferences.tabSize]);

		const onOpenChange = useCallback(
			(isOpen: boolean) => {
				setOpen(isOpen);
				if (!isOpen) {
					commit();
					meta?.onCellEditingStop?.();
				}
			},
			[commit, meta],
		);

		const onOpenAutoFocus: NonNullable<
			ComponentProps<typeof PopoverContent>["onOpenAutoFocus"]
		> = useCallback((event) => {
			// The editor focuses itself once it mounts.
			event.preventDefault();
		}, []);

		const onWrapperKeyDown = useCallback(
			(event: KeyboardEvent<HTMLDivElement>) => {
				if (isEditing && !open) {
					if (event.key === "Escape") {
						event.preventDefault();
						meta?.onCellEditingStop?.();
					} else if (event.key === "Tab") {
						event.preventDefault();
						meta?.onCellEditingStop?.({
							direction: event.shiftKey ? "left" : "right",
						});
					}
				}
			},
			[isEditing, open, meta],
		);

		// Sync open state with isEditing prop and initialize editor value
		useEffect(() => {
			if (isEditing && !open) {
				// Initialize editor with formatted JSON
				setEditorValue(JSON.stringify(currentJsonValue, null, editorPreferences.tabSize));
				setOpen(true);
			} else if (!isEditing && open) {
				setOpen(false);
			}
		}, [isEditing, open, currentJsonValue]);

		useEffect(() => {
			if (isFocused && !isEditing && !meta?.isScrolling && containerRef.current) {
				containerRef.current.focus();
			}
		}, [isFocused, isEditing, meta?.isScrolling]);

		useHotkeys("enter", () => onSave(), { enabled: open });
		useHotkeys("esc", () => onCancel(), { enabled: open });

		return (
			<CellPopover
				active={open || isEditing}
				open={open}
				onOpenChange={onOpenChange}
				anchor={
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
						<span data-slot="grid-cell-content">{displayValue}</span>
					</TableCellWrapper>
				}
			>
				<PopoverContent
					data-grid-cell-editor=""
					align="start"
					side="bottom"
					sideOffset={0}
					className="w-[440px] rounded-none p-0 gap-0"
					onOpenAutoFocus={onOpenAutoFocus}
				>
					<Suspense fallback={<div className="h-[240px]" />}>
						<JsonEditor
							value={editorValue}
							onChange={setEditorValue}
							onSave={onSave}
							onCancel={onCancel}
							className="h-[240px]"
						/>
					</Suspense>
					{parseError && (
						<p className="border-t px-2 py-1.5 text-xs text-destructive truncate">
							{parseError}
						</p>
					)}
					<div className="flex flex-col border-t">
						<Button
							variant="ghost"
							size="sm"
							disabled={Boolean(parseError)}
							onClick={onSave}
							className="rounded-none justify-start text-xs py-4 px-2"
						>
							<Kbd className="text-xs font-normal">⌘↵</Kbd>
							<span className="ml-1 text-xs">Save Changes</span>
						</Button>

						<Button
							variant="ghost"
							size="sm"
							onClick={onCancel}
							className="rounded-none justify-start text-xs py-4 px-2"
						>
							<Kbd className="text-xs font-normal">esc</Kbd>
							<span className="ml-1 text-xs">Cancel Changes</span>
						</Button>
					</div>
				</PopoverContent>
			</CellPopover>
		);
	},
);

TableJsonCell.displayName = "TableJsonCell";

export const TableForeignKeyCell = memo(
	({
		cell,
		table,
		rowIndex,
		columnId,
		isEditing,
		isFocused,
		isSelected,
	}: CellVariantProps<TableRecord>) => {
		const { setUpdate, clearUpdate, getUpdate } = useUpdateCellStore();
		const rawInitialValue = cell.getValue();
		const initialValue = formatCellValue(rawInitialValue);

		const [editorValue, setEditorValue] = useState(() => initialValue ?? "");
		const [open, setOpen] = useState(false);
		const [drawerOpen, setDrawerOpen] = useState(false);
		// Like CellPopover: no idle drawer per cell; mount it on first open and keep it.
		const [drawerMounted, setDrawerMounted] = useState(false);
		if (drawerOpen && !drawerMounted) setDrawerMounted(true);
		const textareaRef = useRef<HTMLTextAreaElement>(null);
		const containerRef = useRef<HTMLDivElement>(null);
		const meta = table.options.meta;
		const referencedTable = cell.column.columnDef.meta?.referencedTable;

		const rowData = cell.row.original as Record<string, unknown>;
		const columnName = columnId;

		const pendingUpdate = getUpdate(rowData, columnName, table.options.meta?.editScope);
		const displayValue = pendingUpdate
			? formatCellValue(pendingUpdate.newValue)
			: (initialValue ?? "");

		const onSave = useCallback(() => {
			setUpdate(
				rowData,
				columnName,
				editorValue,
				rawInitialValue,
				table.options.meta?.editScope,
			);
			meta?.onCellEditingStop?.();
			setOpen(false);
		}, [meta, editorValue, rawInitialValue, columnName, rowData, setUpdate]);

		const onCancel = useCallback(() => {
			setEditorValue(initialValue ?? "");
			clearUpdate(rowData, columnName, table.options.meta?.editScope);
			meta?.onCellEditingStop?.();
			setOpen(false);
		}, [meta, initialValue, columnName, rowData, clearUpdate]);

		const onChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
			setEditorValue(event.target.value);
		}, []);

		const onOpenChange = useCallback(
			(isOpen: boolean) => {
				setOpen(isOpen);
				if (!isOpen) {
					if (editorValue !== initialValue) {
						setUpdate(
							rowData,
							columnName,
							editorValue,
							initialValue,
							table.options.meta?.editScope,
						);
					}
					meta?.onCellEditingStop?.();
				}
			},
			[meta, editorValue, initialValue, columnName, rowData, setUpdate],
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
						meta?.onCellEditingStop?.({
							direction: event.shiftKey ? "left" : "right",
						});
					}
				}
			},
			[isEditing, open, meta],
		);

		const onTextareaKeyDown = useCallback(
			(event: KeyboardEvent<HTMLTextAreaElement>) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
				} else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
					event.preventDefault();
					onSave();
				}
				event.stopPropagation();
			},
			[onCancel, onSave],
		);

		const onTextareaBlur = useCallback(() => {
			if (editorValue !== initialValue) {
				setUpdate(
					rowData,
					columnName,
					editorValue,
					initialValue,
					table.options.meta?.editScope,
				);
			}
			meta?.onCellEditingStop?.();
			setOpen(false);
		}, [meta, editorValue, initialValue, columnName, rowData, setUpdate]);

		useEffect(() => {
			if (isEditing && !open) {
				setEditorValue(displayValue);
				setOpen(true);
			} else if (!isEditing && open) {
				setOpen(false);
			}
		}, [isEditing, open, displayValue]);

		useEffect(() => {
			if (isFocused && !isEditing && !meta?.isScrolling && containerRef.current) {
				containerRef.current.focus();
			}
		}, [isFocused, isEditing, meta?.isScrolling]);

		return (
			<>
				<CellPopover
					active={open || isEditing}
					open={open}
					onOpenChange={onOpenChange}
					anchor={
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
							{displayValue !== "" && (
								<span className="flex items-center gap-1.5 size-full overflow-hidden">
									{referencedTable && (
										<Badge
											variant="outline"
											className="shrink-0 cursor-pointer hover:bg-muted"
											onClick={(e) => {
												e.stopPropagation();
												setDrawerOpen(true);
											}}
										>
											{referencedTable}
										</Badge>
									)}
									<span className="truncate text-muted-foreground">{displayValue}</span>
								</span>
							)}
						</TableCellWrapper>
					}
				>
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
							value={editorValue}
							onChange={onChange}
							onKeyDown={onTextareaKeyDown}
							onBlur={onTextareaBlur}
							className="min-h-[150px] resize-none rounded-none border-0 shadow-none focus-visible:ring-0"
							placeholder="Enter value..."
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
				</CellPopover>
				{drawerMounted && (
					<Drawer
						open={drawerOpen}
						onOpenChange={setDrawerOpen}
					>
						<DrawerContent className="h-[70vh]">
							{referencedTable && (
								<FkDrawerContent
									referencedTable={referencedTable}
									referencedColumn={cell.column.columnDef.meta?.referencedColumn ?? "id"}
									fkValue={displayValue}
								/>
							)}
						</DrawerContent>
					</Drawer>
				)}
			</>
		);
	},
);

TableForeignKeyCell.displayName = "TableForeignKeyCell";
