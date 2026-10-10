import { type CreateIndexSchemaType, createIndexSchema } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import { Checkbox } from "@db-studio/ui/checkbox";
import { Input } from "@db-studio/ui/input";
import { Label } from "@db-studio/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { Spinner } from "@db-studio/ui/spinner";
import { cn } from "@db-studio/ui/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { useTableCols } from "@/features/schema";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { useOverlayStore } from "@/stores/overlay.store";
import { useCreateIndex } from "../hooks/use-create-index";

// Rendered inside the sheet, which unmounts its content on close, so every open starts
// from a blank form.
const CreateIndexFormContent = ({ tableName }: { tableName: string }) => {
	const { closeOverlay } = useOverlayStore();
	const { createIndex, isCreatingIndex } = useCreateIndex({ tableName });
	const { tableCols, isLoadingTableCols } = useTableCols({ tableName });
	const engine = useDatabaseEngine();
	const indexes = engine?.indexes || null;
	const methods = indexes?.methods ?? [];

	const {
		control,
		register,
		handleSubmit,
		setValue,
		watch,
		formState: { errors, dirtyFields, isSubmitted },
	} = useForm<CreateIndexSchemaType>({
		mode: "onSubmit",
		defaultValues: { indexName: "", columns: [], isUnique: false, method: methods[0] },
		resolver: zodResolver(createIndexSchema),
	});
	const selectedColumns = watch("columns");

	const toggleColumn = (columnName: string) => {
		const next = selectedColumns.includes(columnName)
			? selectedColumns.filter((column) => column !== columnName)
			: [...selectedColumns, columnName];
		setValue("columns", next, { shouldValidate: isSubmitted });
		// The suggested name follows the columns until the user types their own.
		if (!dirtyFields.indexName) {
			setValue("indexName", next.length ? `${tableName}_${next.join("_")}_idx` : "", {
				shouldValidate: isSubmitted,
			});
		}
	};

	return (
		<form
			onSubmit={handleSubmit((data) => createIndex(data))}
			className="space-y-6"
		>
			<div className="space-y-2">
				<Label className="text-xs">Columns, in index order</Label>
				{isLoadingTableCols ? (
					<Spinner size="size-5" />
				) : (
					<div className="space-y-1">
						{tableCols?.map(({ columnName }) => {
							const position = selectedColumns.indexOf(columnName);
							const id = `create-index-column-${columnName}`;
							return (
								<div
									key={columnName}
									className="flex items-center gap-2"
								>
									<Checkbox
										id={id}
										checked={position !== -1}
										onCheckedChange={() => toggleColumn(columnName)}
									/>
									<Label
										htmlFor={id}
										className="font-mono font-normal cursor-pointer"
									>
										{columnName}
									</Label>
									{position !== -1 && (
										<span className="text-xs text-muted-foreground">#{position + 1}</span>
									)}
								</div>
							);
						})}
					</div>
				)}
				{errors.columns && (
					<p className="text-xs text-destructive">Select at least one column.</p>
				)}
			</div>

			<div className="space-y-2">
				<Label
					htmlFor="create-index-name"
					className="text-xs"
				>
					Name
				</Label>
				<Input
					id="create-index-name"
					{...register("indexName")}
					placeholder={`${tableName}_column_idx`}
					className={cn(
						"font-mono",
						errors.indexName && "border-destructive ring-destructive ring-1",
					)}
				/>
				{errors.indexName && <p className="text-xs text-destructive">Enter an index name.</p>}
			</div>

			<div className="flex items-center gap-6">
				<Controller
					control={control}
					name="isUnique"
					render={({ field }) => (
						<div className="flex items-center gap-2">
							<Checkbox
								id="create-index-unique"
								checked={field.value}
								onCheckedChange={(checked) => field.onChange(checked === true)}
							/>
							<Label
								htmlFor="create-index-unique"
								className="cursor-pointer"
							>
								Unique
							</Label>
						</div>
					)}
				/>

				{methods.length > 0 && (
					<Controller
						control={control}
						name="method"
						render={({ field }) => (
							<div className="flex items-center gap-2">
								<Label htmlFor="create-index-method">Method</Label>
								<Select
									value={field.value}
									onValueChange={field.onChange}
								>
									<SelectTrigger
										id="create-index-method"
										className="font-mono"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{methods.map((method) => (
											<SelectItem
												key={method}
												value={method}
												className="font-mono"
											>
												{method}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					/>
				)}
			</div>

			{indexes?.createNote && (
				<p className="flex items-center gap-2 text-xs text-muted-foreground">
					<TriangleAlert className="size-3.5 shrink-0" />
					{indexes.createNote}
				</p>
			)}

			<div className="flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					size="lg"
					onClick={() => closeOverlay("indexes.create-index")}
					disabled={isCreatingIndex}
				>
					Cancel
				</Button>
				<Button
					type="submit"
					variant="default"
					size="lg"
					disabled={isCreatingIndex}
				>
					{isCreatingIndex ? "Creating..." : "Create index"}
				</Button>
			</div>
		</form>
	);
};

export const CreateIndexForm = ({ tableName }: { tableName: string }) => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();

	return (
		<SheetSidebar
			title="Create index"
			description={`Create an index on "${tableName}".`}
			open={isOverlayOpen("indexes.create-index")}
			onOpenChange={(open) => {
				if (!open) closeOverlay("indexes.create-index");
			}}
		>
			<CreateIndexFormContent tableName={tableName} />
		</SheetSidebar>
	);
};
