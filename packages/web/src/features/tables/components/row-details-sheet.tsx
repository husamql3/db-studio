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
import { useEffect, useState } from "react";
import { FormProvider, useFormContext } from "react-hook-form";
import { useHotkeys } from "react-hotkeys-hook";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { AddRecordField, RecordReferenceSheet } from "@/features/records";
import { useTableCols } from "@/features/schema";
import { useOverlayStore } from "@/stores/overlay.store";
import type { TableRecord } from "@/types/table.type";
import { formatCellValue } from "@/utils/format-cell-value";
import { useDeleteCells } from "../hooks/use-delete-cell";
import { useRowDetailsForm } from "../hooks/use-row-details-form";
import { useUpdateRecord } from "../hooks/use-update-record";
import { useRowDetailsStore } from "../stores/row-details.store";
import {
	buildRowUpdates,
	copyTextToClipboard,
	isGeneratedColumn,
} from "../utils/row-details-utils";

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
	const { openOverlay, closeOverlay, isOverlayOpen } = useOverlayStore();
	const { rowIndex, selectRowDetails, clearRowDetails } = useRowDetailsStore();
	const { tableCols, isLoadingTableCols } = useTableCols({ tableName });
	const { updateRecord, isUpdatingRecord } = useUpdateRecord({ tableName });
	const { deleteCells, isDeletingCells } = useDeleteCells({ tableName });

	// Confirmation dialogs go through the overlay registry; the local state below
	// is the payload each one acts on, never its open flag.
	const [pendingAction, setPendingAction] = useState<PendingAction>(null);
	const [pendingSave, setPendingSave] = useState<Record<string, string> | null>(null);

	const openDiscardConfirm = (action: PendingAction) => {
		setPendingAction(action);
		openOverlay("tables.row-discard-changes");
	};
	const closeDiscardConfirm = () => {
		setPendingAction(null);
		closeOverlay("tables.row-discard-changes");
	};

	const open = isOverlayOpen("tables.row-details") && rowIndex !== null;
	const row = rowIndex === null ? undefined : rows[rowIndex];
	const isBusy = isUpdatingRecord || isDeletingCells;

	const { methods, isDirty, pkDirty, primaryKeyColumn, identityColumnNames } =
		useRowDetailsForm({ tableName, tableCols, row, rowIndex });
	const { formState, reset, handleSubmit } = methods;

	// The selected index can fall off the page after the data changes.
	useEffect(() => {
		if (open && rowIndex !== null && !rows[rowIndex]) {
			if (isDirty) {
				openDiscardConfirm("close");
			} else {
				clearRowDetails();
				closeOverlay("tables.row-details");
			}
		}
	}, [open, rowIndex, rows, isDirty, clearRowDetails, closeOverlay]);

	const closeSheet = () => {
		clearRowDetails();
		closeOverlay("tables.row-change-primary-key");
		closeOverlay("tables.row-delete-record");
		closeOverlay("tables.row-discard-changes");
		closeOverlay("tables.row-details");
	};

	const requestClose = () => {
		if (isBusy) return;
		if (isDirty) {
			openDiscardConfirm("close");
		} else {
			closeSheet();
		}
	};

	const requestNavigate = (index: number) => {
		if (isBusy || index === rowIndex || index < 0 || index >= rows.length) return;
		if (isDirty) {
			openDiscardConfirm(index);
		} else {
			selectRowDetails(index);
		}
	};

	const requestDelete = () => {
		if (isBusy) return;
		if (isDirty) {
			openDiscardConfirm("delete");
		} else {
			openOverlay("tables.row-delete-record");
		}
	};

	const confirmDiscard = () => {
		const action = pendingAction;
		closeDiscardConfirm();
		if (action === "close") {
			closeSheet();
		} else if (action === "delete") {
			openOverlay("tables.row-delete-record");
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
				primaryKey: identityColumnNames[0],
				primaryKeys: identityColumnNames,
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
			openOverlay("tables.row-change-primary-key");
			return;
		}
		void doSave(data);
	};

	const confirmDelete = async () => {
		if (!row) return;
		closeOverlay("tables.row-delete-record");
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
				closeButton={false}
				modal={false}
				// Focus leaving the sheet (a nested confirmation dialog, the grid)
				// must not dismiss it — only a deliberate click outside does.
				onFocusOutside={(event) => event.preventDefault()}
				onPointerDownOutside={(event) => {
					// Clicking another row re-targets this sheet rather than closing it.
					if ((event.target as HTMLElement | null)?.closest("table, [role=alertdialog]")) {
						event.preventDefault();
					}
				}}
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
										disabled={isBusy || !isDirty || identityColumnNames.length === 0}
										title={
											identityColumnNames.length > 0
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
				open={isOverlayOpen("tables.row-discard-changes")}
				onOpenChange={(isOpen) => {
					if (!isOpen) closeDiscardConfirm();
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
				open={isOverlayOpen("tables.row-change-primary-key")}
				onOpenChange={(isOpen) => {
					// Controlled and trigger-less: the dialog only ever asks to close.
					if (isOpen) return;
					closeOverlay("tables.row-change-primary-key");
					setPendingSave(null);
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
								closeOverlay("tables.row-change-primary-key");
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
				open={isOverlayOpen("tables.row-delete-record")}
				onOpenChange={(isOpen) => {
					if (!isOpen) closeOverlay("tables.row-delete-record");
				}}
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
