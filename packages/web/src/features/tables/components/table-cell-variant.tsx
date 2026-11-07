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
import { format, parseISO } from "date-fns";
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
import type { NavigationDirection, TableRecord } from "@/features/tables/table.type";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { formatCellValue } from "@/utils/format-cell-value";
import {
	CELL_DEFAULT,
	type CellUpdate,
	useUpdateCellStore,
} from "../stores/update-cell.store";
import { FkDrawerContent } from "./fk-drawer-content";
import { TableCellWrapper } from "./table-cell-wrapper";

/** A cell's text; NULL, empty text and a pending DEFAULT get labels no real value can mimic. */
export const CellContent = ({
	value,
	className,
	children,
}: {
	value: unknown;
	className?: string;
	children?: ReactNode;
}) => {
	const marker =
		value === null || value === undefined
			? "NULL"
			: value === CELL_DEFAULT
				? "DEFAULT"
				: value === ""
					? "EMPTY"
					: null;

	return (
		<span
			data-slot="grid-cell-content"
			data-marker={marker ?? undefined}
			className={cn(className, marker && "font-mono text-xs text-muted-foreground/70")}
		>
			{marker ?? children ?? formatCellValue(value)}
		</span>
	);
};

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

		const [editorValue, setEditorValue] = useState("");
		const [open, setOpen] = useState(false);
		// True from opening until the first save or cancel; the blur that closing causes must not
		// save again, against a value the first save already changed.
		const editingRef = useRef(false);
		const textareaRef = useRef<HTMLTextAreaElement>(null);
		const meta = table.options.meta;
		const columnMeta = cell.column.columnDef.meta;

		const rowData = cell.row.original as Record<string, unknown>;
		const columnName = columnId;

		// A pending edit wins over the server value.
		const pendingUpdate = getUpdate(rowData, columnName, meta?.editScope);
		const currentValue = pendingUpdate ? pendingUpdate.newValue : rawInitialValue;
		// What the textarea starts from; NULL and DEFAULT start empty and show as its placeholder.
		const editorStart = currentValue === CELL_DEFAULT ? "" : formatCellValue(currentValue);

		const close = useCallback(
			(direction?: NavigationDirection) => {
				editingRef.current = false;
				meta?.onCellEditingStop?.({ direction });
				setOpen(false);
			},
			[meta],
		);

		const commit = useCallback(
			(value: unknown, direction?: NavigationDirection) => {
				setUpdate(rowData, columnName, value, rawInitialValue, meta?.editScope);
				close(direction);
			},
			[close, rowData, columnName, rawInitialValue, meta?.editScope, setUpdate],
		);

		// Typed text only replaces the value when it changed, so confirming an untouched NULL
		// cell keeps it NULL instead of writing an empty string.
		const onSave = useCallback(
			(direction?: NavigationDirection) => {
				if (!editingRef.current) return;

				if (editorValue === editorStart) close(direction);
				else commit(editorValue, direction);
			},
			[editorValue, editorStart, close, commit],
		);

		const onCancel = useCallback(() => {
			clearUpdate(rowData, columnName, meta?.editScope);
			close();
		}, [close, columnName, rowData, clearUpdate, meta?.editScope]);

		const onChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
			setEditorValue(event.target.value);
		}, []);

		const onOpenChange = useCallback(
			(isOpen: boolean) => {
				if (isOpen) setOpen(true);
				else onSave();
			},
			[onSave],
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

		const onTextareaKeyDown = useCallback(
			(event: KeyboardEvent<HTMLTextAreaElement>) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
				} else if (
					event.key === "Enter" &&
					!event.shiftKey &&
					!event.nativeEvent.isComposing
				) {
					// Enter confirms like a spreadsheet; Shift+Enter adds a line break.
					event.preventDefault();
					onSave();
				} else if (event.key === "Tab") {
					event.preventDefault();
					onSave(event.shiftKey ? "left" : "right");
				}

				// Stop propagation to prevent grid navigation
				event.stopPropagation();
			},
			[onCancel, onSave],
		);

		useEffect(() => {
			if (isEditing && !open) {
				setEditorValue(editorStart);
				editingRef.current = true;
				setOpen(true);
			} else if (!isEditing && open) {
				setOpen(false);
			}
		}, [isEditing, open, editorStart]);

		useHotkeys("enter", () => onSave(), { enabled: open });
		useHotkeys("esc", () => onCancel(), { enabled: open });

		// Explicit values the textarea cannot express. Labels match the grid's markers; the
		// current one stays in place, pressed, so the buttons never shift between cells.
		const valueActions: { label: string; title: string; value: unknown }[] = [
			...(columnMeta?.isNullable ? [{ label: "NULL", title: "Set NULL", value: null }] : []),
			{ label: "EMPTY", title: "Set empty string", value: "" },
			...(columnMeta?.hasDefault
				? [{ label: "DEFAULT", title: "Use column default", value: CELL_DEFAULT }]
				: []),
		];

		return (
			<CellPopover
				active={open || isEditing}
				open={open}
				onOpenChange={onOpenChange}
				anchor={
					<TableCellWrapper
						cell={cell}
						table={table}
						rowIndex={rowIndex}
						columnId={columnId}
						isEditing={isEditing}
						isFocused={isFocused}
						isSelected={isSelected}
						editorOpen={open}
					>
						<CellContent value={currentValue} />
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
						onBlur={() => onSave()}
						className="min-h-[150px] resize-none rounded-none border-0 shadow-none focus-visible:ring-0"
						placeholder={
							currentValue === null || currentValue === undefined
								? "NULL"
								: currentValue === CELL_DEFAULT
									? "DEFAULT"
									: "Enter text..."
						}
					/>
					{/* Mouse down keeps focus in the textarea, so its blur does not save typed text first. */}
					<div className="flex h-8 items-center gap-1 border-t px-1.5">
						<span className="px-1 text-[0.625rem] text-muted-foreground/70">Set</span>
						{valueActions.map((action) => {
							const isCurrent = (currentValue ?? null) === action.value;

							return (
								<Button
									key={action.label}
									variant="ghost"
									size="xs"
									aria-pressed={isCurrent}
									aria-label={action.title}
									title={action.title}
									disabled={isCurrent}
									className="font-mono disabled:opacity-100 aria-pressed:bg-muted aria-pressed:text-foreground aria-pressed:ring-1 aria-pressed:ring-border aria-pressed:ring-inset"
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => commit(action.value)}
								>
									{action.label}
								</Button>
							);
						})}
						<Button
							variant="ghost"
							size="xs"
							className="ml-auto"
							onMouseDown={(event) => event.preventDefault()}
							onClick={onCancel}
						>
							<Kbd className="h-4 min-w-4">esc</Kbd>
							Cancel
						</Button>
						<Button
							variant="ghost"
							size="xs"
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => onSave()}
						>
							<Kbd className="h-4 min-w-4">↵</Kbd>
							Save
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

		const rowData = cell.row.original as Record<string, unknown>;
		const columnName = columnId;

		// A pending edit wins over the server value, also after a refetch (e.g. Live mode).
		const pendingUpdate = getUpdate(rowData, columnName, meta?.editScope);
		const displayValue = pendingUpdate ? (pendingUpdate.newValue as number) : initialValue;

		// The input exists only while the cell is edited; a page holds hundreds of number cells.
		const [value, setValue] = useState(displayValue);
		const [open, setOpen] = useState(false);

		// Follow the grid's editing state, starting each edit from the value the cell shows.
		if (isEditing !== open) {
			if (isEditing) setValue(displayValue);
			setOpen(isEditing);
		}

		const onSave = useCallback(
			(direction?: NavigationDirection) => {
				setUpdate(rowData, columnName, value, initialValue, table.options.meta?.editScope);

				setOpen(false);
				meta?.onCellEditingStop?.({ direction });
			},
			[meta, value, initialValue, columnName, rowData, setUpdate],
		);

		const onCancel = useCallback(() => {
			setValue(initialValue);

			clearUpdate(rowData, columnName, table.options.meta?.editScope);

			setOpen(false);
			meta?.onCellEditingStop?.();
		}, [meta, initialValue, columnName, rowData, clearUpdate, value]);

		const onChange = useCallback(
			(event: ChangeEvent<HTMLInputElement>) => {
				const newValue = event.target.value;
				setValue(Number(newValue));

				// Stages the change; nothing is saved until Save.
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
				} else if (event.key === "Enter") {
					event.preventDefault();
					onSave();
				} else if (event.key === "Tab") {
					event.preventDefault();
					onSave(event.shiftKey ? "left" : "right");
				}

				// Stop propagation to prevent grid navigation
				event.stopPropagation();
			},
			[onCancel, onSave, value, initialValue],
		);

		const onTextInputBlur = useCallback(() => {
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

		useHotkeys("enter", () => onSave(), { enabled: open });
		useHotkeys("esc", () => onCancel(), { enabled: open });

		return (
			<TableCellWrapper
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
					<CellContent value={displayValue} />
				)}
			</TableCellWrapper>
		);
	},
);

TableNumberCell.displayName = "TableNumberCell";

// The NULL item's value. Any printable text can be an enum label (even "null"); text columns
// hold no NUL character, so no label can equal this.
const NULL_OPTION = "\u0000null";

/** A cell edited by picking one of `options` or NULL; the select opens as editing starts. */
const TableSelectCell = memo(
	({
		cell,
		table,
		rowIndex,
		columnId,
		isEditing,
		isFocused,
		isSelected,
		options,
		toOption,
		fromOption,
	}: CellVariantProps<TableRecord> & {
		options: readonly string[];
		toOption: (value: unknown) => string;
		/** Turns a picked option into the value to write; the option itself when omitted. */
		fromOption?: (option: string) => CellUpdate["newValue"];
	}) => {
		const { setUpdate, clearUpdate, getUpdate } = useUpdateCellStore();
		const initialValue = cell.getValue();
		const meta = table.options.meta;

		const rowData = cell.row.original as Record<string, unknown>;
		const pendingUpdate = getUpdate(rowData, columnId, meta?.editScope);
		const currentValue = pendingUpdate ? pendingUpdate.newValue : initialValue;
		const isNull = currentValue === null || currentValue === undefined;

		const onValueChange = (option: string) => {
			const newValue =
				option === NULL_OPTION ? null : fromOption ? fromOption(option) : option;

			setUpdate(rowData, columnId, newValue, initialValue, meta?.editScope);
			meta?.onCellEditingStop?.();
		};

		const onCancel = () => {
			clearUpdate(rowData, columnId, meta?.editScope);
			meta?.onCellEditingStop?.();
		};

		return (
			<TableCellWrapper
				cell={cell}
				table={table}
				rowIndex={rowIndex}
				columnId={columnId}
				isEditing={isEditing}
				isFocused={isFocused}
				isSelected={isSelected}
				className="p-0!"
			>
				{isEditing ? (
					// Mounted only while editing, so it is open whenever it exists; closing it ends the edit.
					<Select
						value={isNull ? NULL_OPTION : toOption(currentValue)}
						onValueChange={onValueChange}
						open
						onOpenChange={(open) => {
							if (!open) meta?.onCellEditingStop?.();
						}}
					>
						<SelectTrigger
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
								meta?.onCellEditingStop?.();
							}}
						>
							{options.map((option) => (
								<SelectItem
									key={option}
									value={option}
								>
									{option}
								</SelectItem>
							))}
							<SelectItem value={NULL_OPTION}>NULL</SelectItem>
						</SelectContent>
					</Select>
				) : (
					<span className="flex items-center size-full px-2 py-1.5 truncate">
						<CellContent value={currentValue}>
							{isNull ? null : toOption(currentValue)}
						</CellContent>
					</span>
				)}
			</TableCellWrapper>
		);
	},
);

TableSelectCell.displayName = "TableSelectCell";

const BOOLEAN_OPTIONS = ["true", "false"];
const toBooleanOption = (value: unknown) => (value ? "true" : "false");
const fromBooleanOption = (option: string) => option === "true";
const NO_OPTIONS: string[] = [];

export const TableBooleanCell = (props: CellVariantProps<TableRecord>) => (
	<TableSelectCell
		{...props}
		options={BOOLEAN_OPTIONS}
		toOption={toBooleanOption}
		fromOption={fromBooleanOption}
	/>
);

export const TableEnumCell = (props: CellVariantProps<TableRecord>) => (
	<TableSelectCell
		{...props}
		options={props.cell.column.columnDef.meta?.enumValues ?? NO_OPTIONS}
		toOption={String}
	/>
);

const DATE_ONLY_TEXT = /^\d{4}-\d{2}-\d{2}$/;

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
		const meta = table.options.meta;

		const rowData = cell.row.original as Record<string, unknown>;
		const columnName = columnId;

		const pendingUpdate = getUpdate(rowData, columnName, table.options.meta?.editScope);

		const currentValue = pendingUpdate
			? (pendingUpdate.newValue as string | null)
			: initialValue;

		// A DATE column holds a calendar day, written as the picked local day: the ISO instant
		// of local midnight is the previous day east of UTC. MongoDB labels its BSON dates
		// "date", and those are instants.
		const isDocumentModel = useDatabaseEngine()?.dataModel === "document";
		const dateOnly = cell.column.columnDef.meta?.dataTypeLabel === "date" && !isDocumentModel;

		const onDateChange = useCallback(
			(date: Date | null | undefined) => {
				const dateString = date
					? dateOnly
						? format(date, "yyyy-MM-dd")
						: date.toISOString()
					: null;

				setUpdate(
					rowData,
					columnName,
					dateString,
					initialValue,
					table.options.meta?.editScope,
				);

				meta?.onCellEditingStop?.();
			},
			[columnName, initialValue, rowData, setUpdate, meta, dateOnly],
		);

		const onCancel = useCallback(() => {
			clearUpdate(rowData, columnName, table.options.meta?.editScope);

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

		// A bare day parses as UTC midnight with `new Date`, the previous day west of UTC.
		const date = currentValue
			? DATE_ONLY_TEXT.test(currentValue)
				? parseISO(currentValue)
				: new Date(currentValue)
			: undefined;

		return (
			<TableCellWrapper
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
					<CellContent value={currentValue}>
						{date && !Number.isNaN(date.getTime()) ? format(date, "yyyy-MM-dd") : currentValue}
					</CellContent>
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

		// A JSON column can arrive as its text; text that is not JSON stays a string value.
		let initialValue = rawValue;

		if (typeof rawValue === "string") {
			try {
				initialValue = JSON.parse(rawValue);
			} catch {
				initialValue = rawValue;
			}
		}

		// Separate editor value (formatted) from display value (compact)
		const [editorValue, setEditorValue] = useState(
			() => JSON.stringify(initialValue, null, editorPreferences.tabSize) ?? "",
		);

		const [open, setOpen] = useState(false);
		const meta = table.options.meta;

		const rowData = cell.row.original as Record<string, unknown>;
		const columnName = columnId;

		const pendingUpdate = getUpdate(rowData, columnName, table.options.meta?.editScope);

		const currentJsonValue = pendingUpdate ? pendingUpdate.newValue : initialValue;

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

			meta?.onCellEditingStop?.();
			setOpen(false);
		}, [commit, meta]);

		const onCancel = useCallback(() => {
			setEditorValue(JSON.stringify(initialValue, null, editorPreferences.tabSize) ?? "");

			clearUpdate(rowData, columnName, table.options.meta?.editScope);

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

		useEffect(() => {
			if (isEditing && !open) {
				setEditorValue(JSON.stringify(currentJsonValue, null, editorPreferences.tabSize));
				setOpen(true);
			} else if (!isEditing && open) {
				setOpen(false);
			}
		}, [isEditing, open, currentJsonValue]);

		useHotkeys("enter", () => onSave(), { enabled: open });
		useHotkeys("esc", () => onCancel(), { enabled: open });

		return (
			<CellPopover
				active={open || isEditing}
				open={open}
				onOpenChange={onOpenChange}
				anchor={
					<TableCellWrapper
						cell={cell}
						table={table}
						rowIndex={rowIndex}
						columnId={columnId}
						isEditing={isEditing}
						isFocused={isFocused}
						isSelected={isSelected}
						editorOpen={open}
					>
						<CellContent value={currentJsonValue}>{displayValue}</CellContent>
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

		return (
			<>
				<CellPopover
					active={open || isEditing}
					open={open}
					onOpenChange={onOpenChange}
					anchor={
						<TableCellWrapper
							cell={cell}
							table={table}
							rowIndex={rowIndex}
							columnId={columnId}
							isEditing={isEditing}
							isFocused={isFocused}
							isSelected={isSelected}
							editorOpen={open}
						>
							{pendingUpdate?.newValue === null ||
							(!pendingUpdate &&
								(rawInitialValue === null || rawInitialValue === undefined)) ? (
								<CellContent value={null} />
							) : (
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
