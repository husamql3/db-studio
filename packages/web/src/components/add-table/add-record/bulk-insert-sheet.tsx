import { useCallback, useState } from "react";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SheetClose } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useBulkInsertRecords } from "@/hooks/use-bulk-insert-records";
import { useSheetStore } from "@/stores/sheet.store";
import { parseBulkData } from "@/utils/parse-bulk-data";

export const BulkInsertSheet = ({ tableName }: { tableName: string }) => {
	const { closeSheet, isSheetOpen } = useSheetStore();
	const { bulkInsertRecords, isInserting } = useBulkInsertRecords({
		tableName,
	});

	const [inputValue, setInputValue] = useState("");
	const [parsedRecords, setParsedRecords] = useState<Record<string, unknown>[]>([]);
	const [parseError, setParseError] = useState<string | null>(null);
	const [format, setFormat] = useState<"auto" | "csv" | "json">("auto");

	const handleParse = useCallback(() => {
		setParseError(null);
		setParsedRecords([]);

		try {
			if (!inputValue.trim()) {
				setParseError("Input is empty");
				return;
			}

			const records = parseBulkData(inputValue);
			setParsedRecords(records);
		} catch (error) {
			setParseError(error instanceof Error ? error.message : "Failed to parse data");
		}
	}, [inputValue]);

	const handleInsert = async () => {
		if (parsedRecords.length === 0) {
			setParseError("No records to insert");
			return;
		}

		try {
			await bulkInsertRecords(parsedRecords, {
				onSuccess: () => {
					setInputValue("");
					setParsedRecords([]);
					setParseError(null);
				},
			});
		} catch (error) {
			console.error("Error inserting records:", error);
		}
	};

	const handleCancel = () => {
		setInputValue("");
		setParsedRecords([]);
		setParseError(null);
		closeSheet("bulk-insert-records");
	};

	const handleClear = () => {
		setInputValue("");
		setParsedRecords([]);
		setParseError(null);
	};

	return (
		<SheetSidebar
			title={`Bulk Insert Records into: ${tableName}`}
			open={isSheetOpen("bulk-insert-records")}
			onOpenChange={(open) => {
				if (!open) {
					handleCancel();
				}
			}}
		>
			<div className="flex flex-col h-full gap-4">
				{/* Format selection */}
				<div className="flex gap-2">
					<button
						onClick={() => setFormat("auto")}
						type="button"
						className={`px-3 py-1 text-sm rounded-md transition-colors ${
							format === "auto"
								? "bg-blue-600 text-white"
								: "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
						}`}
					>
						Auto
					</button>
					<button
						onClick={() => setFormat("csv")}
						type="button"
						className={`px-3 py-1 text-sm rounded-md transition-colors ${
							format === "csv"
								? "bg-blue-600 text-white"
								: "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
						}`}
					>
						CSV
					</button>
					<button
						onClick={() => setFormat("json")}
						type="button"
						className={`px-3 py-1 text-sm rounded-md transition-colors ${
							format === "json"
								? "bg-blue-600 text-white"
								: "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
						}`}
					>
						JSON
					</button>
				</div>

				{/* Info alert */}
				<Alert
					variant="info"
					title="Bulk Insert"
					message={
						format === "json"
							? 'Enter JSON array or single object. Example: [{"name": "John", "age": 30}, {"name": "Jane", "age": 28}]'
							: "Enter CSV data with headers. Supports comma, tab, or semicolon delimiters. First row should be column names."
					}
				/>

				{/* Input textarea */}
				<div className="flex-1 flex flex-col">
					<Label
						htmlFor="text-input"
						className="mb-2 text-sm font-medium text-zinc-300"
					>
						Data Input
					</Label>
					<Textarea
						id="text-input"
						value={inputValue}
						onChange={(e) => {
							setInputValue(e.target.value);
							// Clear parse results when input changes
							setParsedRecords([]);
							setParseError(null);
						}}
						placeholder={
							format === "json"
								? '[{"column1": "value1", "column2": "value2"}]'
								: "column1,column2,column3\nvalue1,value2,value3\nvalue4,value5,value6"
						}
						className="flex-1 resize-none font-mono text-sm"
					/>
				</div>

				{/* Parse error */}
				{parseError && (
					<Alert
						variant="error"
						title="Parse Error"
						message={parseError}
					/>
				)}

				{/* Parsed records preview */}
				{parsedRecords.length > 0 && (
					<Alert
						variant="success"
						title="Ready to Insert"
						message={`${parsedRecords.length} record${parsedRecords.length !== 1 ? "s" : ""} parsed successfully`}
					/>
				)}

				{/* Action buttons */}
				<div className="flex justify-between gap-2">
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="lg"
							onClick={handleClear}
							disabled={!inputValue || isInserting}
						>
							Clear
						</Button>
						<Button
							variant="secondary"
							size="lg"
							onClick={handleParse}
							disabled={!inputValue || isInserting}
						>
							Preview
						</Button>
					</div>
					<div className="flex gap-2">
						<SheetClose
							asChild
							onClick={handleCancel}
							disabled={isInserting}
						>
							<Button
								variant="outline"
								size="lg"
							>
								Close
							</Button>
						</SheetClose>

						<Button
							type="button"
							size="lg"
							onClick={handleInsert}
							disabled={parsedRecords.length === 0 || isInserting}
						>
							{isInserting ? "Inserting..." : "Insert"}
						</Button>
					</div>
				</div>
			</div>
		</SheetSidebar>
	);
};
