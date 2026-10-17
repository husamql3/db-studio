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
import { Input } from "@db-studio/ui/input";
import { cn } from "@db-studio/ui/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, KeyRound, Link2 } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { z } from "zod";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { ColumnTypeField } from "@/features/table-builder/components/fields/column-type-field";
import { useOverlayStore } from "@/stores/overlay.store";
import { type ColumnChange, planColumnChanges, useEditTable } from "../hooks/use-edit-table";
import { useTableCols } from "../hooks/use-table-cols";
import { useSchemaEditStore } from "../stores/schema-edit.store";

const editTableFormSchema = z.object({
	fields: z
		.array(
			z.object({
				columnName: z.string().trim().min(1, "Column name is required"),
				columnType: z.string(),
			}),
		)
		.superRefine((fields, ctx) => {
			const seen = new Set<string>();
			fields.forEach((field, i) => {
				const name = field.columnName.toLowerCase();
				if (seen.has(name)) {
					ctx.addIssue({
						code: "custom",
						message: "Column name must be unique",
						path: [i, "columnName"],
					});
				}
				seen.add(name);
			});
		}),
});

type EditTableFormValues = z.infer<typeof editTableFormSchema>;

const toValues = (tableCols: ColumnInfoSchemaType[]): EditTableFormValues => ({
	fields: tableCols.map((col) => ({
		columnName: col.columnName,
		columnType: col.dataTypeLabel,
	})),
});

export const EditTableSheet = () => {
	const { editingTable } = useSchemaEditStore();
	// Remount per table so one table's form values never render against another's columns.
	return (
		<EditTableSheetContent
			key={editingTable ?? ""}
			tableName={editingTable ?? ""}
		/>
	);
};

const EditTableSheetContent = ({ tableName }: { tableName: string }) => {
	const { openOverlay, closeOverlay, isOverlayOpen } = useOverlayStore();
	const { tableCols, isLoadingTableCols } = useTableCols({ tableName });
	const { editTable, isEditingTable } = useEditTable({ tableName });

	const methods = useForm<EditTableFormValues>({
		mode: "onSubmit",
		defaultValues: toValues(tableCols ?? []),
		resolver: zodResolver(editTableFormSchema),
	});
	const { handleSubmit, watch, reset } = methods;

	useEffect(() => {
		if (tableCols) {
			reset(toValues(tableCols), { keepDirtyValues: true });
		}
	}, [tableCols, reset]);

	const fields = watch("fields");
	const isSynced = tableCols !== undefined && fields.length === tableCols.length;
	// Dirtiness is measured against the live columns: a keepDirtyValues reset leaves
	// react-hook-form's isDirty false even when unapplied edits survive a partial failure.
	const changes = isSynced ? planColumnChanges(tableCols, { fields }) : [];
	const hasChanges = changes.length > 0;
	const changeByColumn = new Map(changes.map((change) => [change.columnName, change]));

	const closeSheet = () => closeOverlay("schema.edit-table");

	const requestClose = () => {
		if (isEditingTable) return;
		if (hasChanges) {
			openOverlay("schema.edit-table-discard-changes");
		} else {
			closeSheet();
		}
	};

	const confirmDiscard = () => {
		reset(toValues(tableCols ?? []));
		closeOverlay("schema.edit-table-discard-changes");
		closeSheet();
	};

	const onSubmit = async (values: EditTableFormValues) => {
		if (!tableCols) return;
		const planned = planColumnChanges(tableCols, values);
		if (planned.length === 0) return;
		try {
			await editTable(planned);
			reset(values);
			closeSheet();
		} catch {
			// useEditTable already reported the failure through toast.promise.
		}
	};

	return (
		<>
			<SheetSidebar
				title="Edit table"
				description={tableName}
				open={isOverlayOpen("schema.edit-table")}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						requestClose();
					}
				}}
			>
				{tableCols && tableCols.length > 0 && isSynced ? (
					<FormProvider {...methods}>
						<form
							onSubmit={handleSubmit(onSubmit)}
							className="flex flex-col h-full"
						>
							<div className="-mx-5 -mt-6 divide-y divide-border">
								{tableCols.map((col, i) => (
									<ColumnRow
										key={col.columnName}
										col={col}
										index={i}
										change={changeByColumn.get(col.columnName)}
										newColumnName={fields[i]?.columnName.trim() ?? ""}
									/>
								))}
							</div>
							<div className="sticky -bottom-6 -mx-5 -mb-6 flex items-center justify-between gap-2 border-t border-border bg-background px-5 py-4">
								<span className="text-xs text-muted-foreground">
									{hasChanges
										? `${changes.length} ${changes.length === 1 ? "column" : "columns"} changed`
										: "No changes"}
								</span>
								<div className="flex gap-2">
									<Button
										type="button"
										variant="outline"
										size="lg"
										disabled={isEditingTable}
										onClick={requestClose}
									>
										Close
									</Button>
									<Button
										type="submit"
										size="lg"
										disabled={isEditingTable || !hasChanges}
									>
										Save changes
									</Button>
								</div>
							</div>
						</form>
					</FormProvider>
				) : (
					<div className="flex flex-col h-full">
						<div className="space-y-6">
							{isLoadingTableCols || (tableCols && tableCols.length > 0) ? (
								<p className="text-sm text-muted-foreground">Loading columns...</p>
							) : (
								<Alert
									variant="info"
									title="No columns found"
									message="This table has no columns to edit."
								/>
							)}
						</div>
					</div>
				)}
			</SheetSidebar>

			<AlertDialog
				open={isOverlayOpen("schema.edit-table-discard-changes")}
				onOpenChange={(isOpen) => {
					if (!isOpen) closeOverlay("schema.edit-table-discard-changes");
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
						<AlertDialogDescription>
							This table has unsaved column changes. Discard them and close?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep editing</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDiscard}>Discard changes</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};

const Chip = ({
	children,
	className,
	title,
}: {
	children: ReactNode;
	className?: string;
	title?: string;
}) => (
	<span
		title={title}
		className={cn(
			"truncate rounded border border-border bg-muted/40 px-1.5 font-mono text-[10px] leading-4 text-muted-foreground",
			className,
		)}
	>
		{children}
	</span>
);

const ColumnRow = ({
	col,
	index,
	change,
	newColumnName,
}: {
	col: ColumnInfoSchemaType;
	index: number;
	change: ColumnChange | undefined;
	newColumnName: string;
}) => {
	const { register, formState } = useFormContext<EditTableFormValues>();
	const nameError = formState.errors.fields?.[index]?.columnName?.message;

	return (
		<div className={cn("grid grid-cols-3 gap-4 px-5 py-3", change && "bg-primary/5")}>
			<div className="col-span-1 flex min-w-0 flex-col gap-1.5">
				<span className="flex items-center gap-1.5">
					{col.isPrimaryKey ? (
						<KeyRound
							aria-label="Primary key"
							className="size-3.5 shrink-0 text-amber-500"
						/>
					) : col.isForeignKey ? (
						<Link2
							aria-label={`References ${col.referencedTable}.${col.referencedColumn}`}
							className="size-3.5 shrink-0 text-sky-500"
						/>
					) : (
						<span className="size-3.5 shrink-0" />
					)}
					<span className="truncate font-mono text-sm font-medium">{col.columnName}</span>
				</span>
				<div className="flex min-w-0 flex-wrap items-center gap-1 pl-5">
					{change?.alter ? (
						<>
							<Chip className="line-through">{col.dataTypeLabel}</Chip>
							<ArrowRight className="size-3 text-muted-foreground" />
							<Chip className="border-primary/40 text-primary">{change.alter.columnType}</Chip>
						</>
					) : (
						<Chip>{col.dataTypeLabel}</Chip>
					)}
					{!col.isNullable && <Chip>not null</Chip>}
					{col.columnDefault && (
						<Chip
							title={col.columnDefault}
							className="max-w-full"
						>
							default {col.columnDefault}
						</Chip>
					)}
				</div>
				{change?.newColumnName !== undefined && (
					<span className="flex min-w-0 items-center gap-1 pl-5 font-mono text-[11px] text-primary">
						<ArrowRight className="size-3 shrink-0" />
						<span className="truncate">{newColumnName}</span>
					</span>
				)}
			</div>
			<div className="col-span-2 grid grid-cols-2 items-start gap-2">
				<div className="flex flex-col gap-1">
					<Input
						aria-label={`Name of ${col.columnName}`}
						aria-invalid={nameError ? true : undefined}
						className="font-mono"
						{...register(`fields.${index}.columnName`)}
					/>
					{nameError && <span className="text-xs text-destructive">{nameError}</span>}
				</div>
				<ColumnTypeField index={index} />
			</div>
		</div>
	);
};
