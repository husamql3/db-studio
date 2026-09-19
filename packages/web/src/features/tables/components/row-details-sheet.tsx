import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { Alert } from "@db-studio/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@db-studio/ui/alert-dialog";
import { Button } from "@db-studio/ui/button";
import { Check, ChevronDown, ChevronUp, Copy, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { useHotkeys } from "react-hotkeys-hook";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { AddRecordField, RecordReferenceSheet } from "@/features/records";
import { useTableCols } from "@/features/schema";
import { useOverlayStore } from "@/stores/overlay.store";
import type { TableRecord } from "@/types/table.type";
import { formatCellValue } from "@/utils/format-cell-value";
import { useDeleteCells } from "../hooks/use-delete-cell";
import { useUpdateRecord } from "../hooks/use-update-record";
import { useRowDetailsStore } from "../stores/row-details.store";
import {
	buildRowUpdates,
	copyTextToClipboard,
	getPrimaryKeyColumn,
	getRecordIdentity,
	isGeneratedColumn,
	toFormValues,
} from "./row-details-utils";

type PendingAction = null | "close" | "delete" | number;

const CopyValueButton = ({ value }: { value: string }) => {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timeout = window.setTimeout(() => setCopied(false), 1200);
		return () => window.clearTimeout(timeout);
	}, [copied]);

	if (!value) return null;

	return (
		<button
			type="button"
			aria-label={copied ? "Copied" : "Copy value"}
			className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:text-foreground"
			onClick={() => {
				void copyTextToClipboard(value)
					.then(() => setCopied(true))
					.catch(() => undefined);
			}}
		>
			{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
		</button>
	);
};

const RowDetailsField = ({
	column,
	displayValue,
	readOnly,
}: {
	column: ColumnInfoSchemaType;
	displayValue: string;
	readOnly: boolean;
}) => {
	const { watch, formState } = useFormContext<Record<string, string>>();
	const liveValue = watch(column.columnName) ?? "";
	const dirty = Boolean(formState.dirtyFields[column.columnName]);

	return (
		<div className="grid grid-cols-3 gap-4">
			<div className="col-span-1 flex flex-col gap-1">
				<span className="text-sm font-medium">
					{column.columnName}
					{dirty && (
						<span className="ml-1.5 inline-block size-1.5 rounded-full bg-primary">
							<span className="sr-only">(modified)</span>
						</span>
					)}
				</span>
				<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
					{column.dataTypeLabel}
					{column.isPrimaryKey && (
						<span className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
							PK
						</span>
					)}
				</span>
			</div>
			<div className="col-span-2 flex w-full items-start gap-2">
				<div className="min-w-0 flex-1">
					{readOnly ? (
						<div
							role="group"
							aria-label={column.columnName}
							className="break-all rounded-md border border-input bg-muted/40 px-3 py-2 text-sm"
						>
							{displayValue || <span className="text-muted-foreground">NULL</span>}
						</div>
					) : (
						<AddRecordField
							{...column}
							hideLabel
						/>
					)}
				</div>
				<CopyValueButton value={readOnly ? displayValue : formatCellValue(liveValue)} />
			</div>
		</div>
	);
};

export const RowDetailsSheet = ({
	tableName,
	rows,
}: {
	tableName: string;
	rows: TableRecord[];
}) => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();
	const { rowIndex, selectRowDetails, clearRowDetails } = useRowDetailsStore();
	const { tableCols, isLoadingTableCols } = useTableCols({ tableName });
	const { updateRecord, isUpdatingRecord } = useUpdateRecord({ tableName });
	const { deleteCells, isDeletingCells } = useDeleteCells({ tableName });

	const [pendingAction, setPendingAction] = useState<PendingAction>(null);
	const [showPkConfirm, setShowPkConfirm] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [pendingSave, setPendingSave] = useState<Record<string, string> | null>(null);

	const open = isOverlayOpen("tables.row-details") && rowIndex !== null;
	const row = rowIndex === null ? undefined : rows[rowIndex];
	const isBusy = isUpdatingRecord || isDeletingCells;

	const primaryKeyColumn = useMemo(() => getPrimaryKeyColumn(tableCols), [tableCols]);
	// The server falls back to an "id" column when no primary key is sent, so
	// saving works for keyless tables that still carry an "id" column.
	const identityColumn = useMemo(
		() => primaryKeyColumn ?? tableCols?.find((col) => col.columnName === "id"),
		[primaryKeyColumn, tableCols],
	);
	const columnsSignature = useMemo(
		() => JSON.stringify((tableCols ?? []).map((col) => col.columnName)),
		[tableCols],
	);

	const methods = useForm<Record<string, string>>({
		defaultValues: useMemo(() => toFormValues(row, tableCols), [row, tableCols]),
	});
	const { formState, reset, handleSubmit } = methods;
	const isDirty = formState.isDirty;
	const pkDirty = primaryKeyColumn
		? Boolean(formState.dirtyFields[primaryKeyColumn.columnName])
		: false;

	const lastRowRef = useRef<TableRecord | undefined>(undefined);
	const lastRecordIdentityRef = useRef<string | undefined>(undefined);
	const lastRowIndexRef = useRef<number | null>(null);
	const lastTableNameRef = useRef<string | null>(null);
	const lastColsSigRef = useRef<string>(columnsSignature);

	// Synchronize form values with the active row. An untouched draft resets from
	// the refreshed row so displayed values stay consistent. Dirty edits are preserved
	// only when the refreshed row has the same stable record identity.
	useEffect(() => {
		const currentIdentity = getRecordIdentity(row, tableCols);
		const isSameSelection =
			tableName === lastTableNameRef.current &&
			rowIndex === lastRowIndexRef.current &&
			columnsSignature === lastColsSigRef.current;

		if (!isSameSelection) {
			lastTableNameRef.current = tableName;
			lastRowIndexRef.current = rowIndex;
			lastColsSigRef.current = columnsSignature;
			lastRowRef.current = row;
			lastRecordIdentityRef.current = currentIdentity;
			methods.reset(toFormValues(row, tableCols));
			return;
		}

		if (row === lastRowRef.current) {
			return;
		}
		lastRowRef.current = row;

		const freshValues = toFormValues(row, tableCols);

		if (!isDirty) {
			lastRecordIdentityRef.current = currentIdentity;
			methods.reset(freshValues);
			return;
		}

		const sameIdentity =
			currentIdentity !== undefined &&
			lastRecordIdentityRef.current !== undefined &&
			currentIdentity === lastRecordIdentityRef.current;

		if (sameIdentity) {
			methods.reset(freshValues, { keepDirtyValues: true });
		} else {
			lastRecordIdentityRef.current = currentIdentity;
			methods.reset(freshValues);
		}
	}, [row, tableCols, tableName, rowIndex, columnsSignature, methods, isDirty]);

	// The selected index can fall off the page after the data changes.
	useEffect(() => {
		if (open && rowIndex !== null && !rows[rowIndex]) {
			if (isDirty) {
				setPendingAction("close");
			} else {
				clearRowDetails();
				closeOverlay("tables.row-details");
			}
		}
	}, [open, rowIndex, rows, isDirty, clearRowDetails, closeOverlay]);

	const closeSheet = () => {
		clearRowDetails();
		closeOverlay("tables.row-details");
	};

	const requestClose = () => {
		if (isBusy) return;
		if (isDirty) {
			setPendingAction("close");
		} else {
			closeSheet();
		}
	};

	const requestNavigate = (index: number) => {
		if (isBusy || index === rowIndex || index < 0 || index >= rows.length) return;
		if (isDirty) {
			setPendingAction(index);
		} else {
			selectRowDetails(index);
		}
	};

	const requestDelete = () => {
		if (isBusy) return;
		if (isDirty) {
			setPendingAction("delete");
		} else {
			setShowDeleteConfirm(true);
		}
	};

	const confirmDiscard = () => {
		const action = pendingAction;
		setPendingAction(null);
		if (action === "close") {
			closeSheet();
		} else if (action === "delete") {
			setShowDeleteConfirm(true);
		} else if (typeof action === "number") {
			selectRowDetails(action);
		}
	};

	const doSave = async (data: Record<string, string>) => {
		if (!row) return;
		const updates = buildRowUpdates(formState.dirtyFields, data);
		if (updates.length === 0) return;
		try {
			await updateRecord({
				rowData: row,
				updates,
				primaryKey: identityColumn?.columnName,
			});
			reset(data);
			closeSheet();
		} catch {
			// The mutation hook already reported the failure through toast.promise.
		}
	};

	const onSubmit = (data: Record<string, string>) => {
		if (pkDirty) {
			setPendingSave(data);
			setShowPkConfirm(true);
			return;
		}
		void doSave(data);
	};

	const confirmDelete = async () => {
		if (!row) return;
		setShowDeleteConfirm(false);
		try {
			const result = await deleteCells([row]);
			if (result.deletedCount > 0) {
				closeSheet();
			}
		} catch {
			// The mutation hook already reported the failure through toast.promise.
		}
	};

	const canPrev = rowIndex !== null && rowIndex > 0;
	const canNext = rowIndex !== null && rowIndex < rows.length - 1;

	// Up/Down moves between rows. react-hotkeys-hook ignores form tags by
	// default, so navigation pauses while an editor is focused, per spec.
	useHotkeys(
		"up, down",
		(event) => {
			if (rowIndex === null) return;
			event.preventDefault();
			requestNavigate(event.key === "ArrowUp" ? rowIndex - 1 : rowIndex + 1);
		},
		{ enabled: open && !isBusy },
		[open, isBusy, rowIndex, rows.length, isDirty],
	);

	return (
		<>
			<SheetSidebar
				title="Row details"
				description={
					rowIndex !== null
						? `${tableName} · Row ${rowIndex + 1} of ${rows.length}`
						: tableName
				}
				cta={
					<div className="flex items-center gap-1">
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Previous row"
							disabled={!canPrev || isBusy}
							onClick={() => rowIndex !== null && requestNavigate(rowIndex - 1)}
						>
							<ChevronUp className="size-4" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Next row"
							disabled={!canNext || isBusy}
							onClick={() => rowIndex !== null && requestNavigate(rowIndex + 1)}
						>
							<ChevronDown className="size-4" />
						</Button>
					</div>
				}
				open={open}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						requestClose();
					}
				}}
			>
				{tableCols && tableCols.length > 0 && row ? (
					<FormProvider {...methods}>
						<form
							onSubmit={handleSubmit(onSubmit)}
							className="flex flex-col h-full"
						>
							<div className="space-y-6">
								{tableCols.map((col) => (
									<RowDetailsField
										key={col.columnName}
										column={col}
										displayValue={formatCellValue(row[col.columnName])}
										readOnly={isGeneratedColumn(col)}
									/>
								))}
							</div>

							<div className="flex items-center justify-between gap-2 py-6">
								<Button
									type="button"
									variant="destructive"
									size="lg"
									disabled={isBusy || !primaryKeyColumn}
									title={
										primaryKeyColumn
											? undefined
											: "Records in tables without a primary key can't be deleted"
									}
									onClick={requestDelete}
								>
									<Trash2 className="size-4" />
									Delete
								</Button>

								<div className="flex gap-2">
									<Button
										type="button"
										variant="outline"
										size="lg"
										disabled={isBusy}
										onClick={requestClose}
									>
										Close
									</Button>
									<Button
										type="submit"
										size="lg"
										disabled={isBusy || !isDirty || !identityColumn}
										title={
											identityColumn
												? undefined
												: "Saving needs a primary key or an id column to address the record"
										}
									>
										Save changes
									</Button>
								</div>
							</div>
						</form>

						<RecordReferenceSheet />
					</FormProvider>
				) : (
					<div className="flex flex-col h-full">
						<div className="space-y-6">
							{isLoadingTableCols ? (
								<p className="text-sm text-muted-foreground">Loading row details...</p>
							) : (
								<Alert
									variant="info"
									title="No columns found"
									message="Please add at least one column to the table before viewing records."
								/>
							)}
						</div>
					</div>
				)}
			</SheetSidebar>

			<AlertDialog
				open={pendingAction !== null}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						setPendingAction(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
						<AlertDialogDescription>
							This record has unsaved changes. Discard them and continue?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep editing</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDiscard}>Discard changes</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={showPkConfirm}
				onOpenChange={(isOpen) => {
					setShowPkConfirm(isOpen);
					if (!isOpen) {
						setPendingSave(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Change the primary key?</AlertDialogTitle>
						<AlertDialogDescription>
							Changing the primary key changes the identity of this record. Existing references
							to the old key may break. Are you sure?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setShowPkConfirm(false);
								if (pendingSave) {
									void doSave(pendingSave);
									setPendingSave(null);
								}
							}}
						>
							Change primary key
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={showDeleteConfirm}
				onOpenChange={setShowDeleteConfirm}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete record</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this record from "{tableName}"? This action
							cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								void confirmDelete();
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
