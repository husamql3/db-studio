import type { Cell, Table } from "@tanstack/react-table";
import {
	type ChangeEvent,
	type ComponentProps,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useUpdateCellStore } from "@/stores/update-cell-store";
import type { TableRecord } from "@/types/table.type";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";
import { Textarea } from "../ui/textarea";
import { TableCellWrapper } from "./table-cell-wrapper";

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
			// !meta?.searchOpen &&
			!meta?.isScrolling &&
			containerRef.current
		) {
			containerRef.current.focus();
		}
	}, [isFocused, isEditing, open, meta?.isScrolling]);

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
				sideOffset={sideOffset}
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
				<div className="flex flex-col">
					<Button
						variant="ghost"
						size="sm"
						className="rounded-none justify-start text-xs p-3"
					>
						<Kbd className="text-xs font-normal">⌘↵</Kbd>
						<span className="ml-1 text-xs">Save Changes</span>
					</Button>

					<Button
						variant="ghost"
						size="sm"
						className="rounded-none justify-start text-xs p-3"
					>
						<Kbd className="text-xs font-normal">esc</Kbd>
						<span className="ml-1 text-xs">Cancel Changes</span>
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};
