import { Alert } from "@db-studio/ui/alert";
import { Button } from "@db-studio/ui/button";
import { Label } from "@db-studio/ui/label";
import { SheetClose } from "@db-studio/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@db-studio/ui/tabs";
import { Textarea } from "@db-studio/ui/textarea";
import { useState } from "react";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { useOverlayStore } from "@/stores/overlay.store";
import { useBulkInsertRecords } from "../hooks/use-bulk-insert-records";
import { parseBulkData } from "../utils/parse-bulk-data";

const CSV_HINT =
	"Enter CSV data with headers. Supports comma, tab, or semicolon delimiters. First row should be column names.";

const JSON_HINT =
	'Enter JSON array or single object. Example: [{"name": "John", "age": 30}, {"name": "Jane", "age": 28}]';

// parseBulkData only reads CSV and JSON text, so the Excel entry takes what Excel exports
// as text: a CSV file, or cells copied from a sheet (pasted as tab-separated rows).
const BULK_INSERT_FORMATS = {
	auto: {
		overlay: "records.bulk-insert",
		title: "Bulk insert records into",
		hintTitle: "Bulk Insert",
		hint: `CSV or JSON, detected automatically. ${CSV_HINT}`,
		fileLabel: "Select CSV or JSON file",
		accept: ".csv,.tsv,.txt,.json",
		placeholder: "column1,column2,column3\nvalue1,value2,value3\nvalue4,value5,value6",
	},
	csv: {
		overlay: "records.bulk-insert-csv",
		title: "Add data from CSV into",
		hintTitle: "CSV Import",
		hint: CSV_HINT,
		fileLabel: "Select CSV file",
		accept: ".csv",
		placeholder: "column1,column2,column3\nvalue1,value2,value3\nvalue4,value5,value6",
	},
	excel: {
		overlay: "records.bulk-insert-excel",
		title: "Add data from Excel into",
		hintTitle: "Excel Import",
		hint: "Excel workbooks (.xlsx, .xls) cannot be read directly. In Excel, save the sheet as CSV and select it here, or copy the cells (headers in the first row) and paste them into the Text tab.",
		fileLabel: "Select a CSV file saved from Excel",
		accept: ".csv,.tsv,.txt",
		placeholder: "column1\tcolumn2\tcolumn3\nvalue1\tvalue2\tvalue3\nvalue4\tvalue5\tvalue6",
	},
	json: {
		overlay: "records.bulk-insert-json",
		title: "Add data from JSON into",
		hintTitle: "JSON Import",
		hint: JSON_HINT,
		fileLabel: "Select JSON file",
		accept: ".json",
		placeholder: '[{"column1": "value1", "column2": "value2"}]',
	},
} as const;

export const BulkInsertSheet = ({
	tableName,
	format,
}: {
	tableName: string;
	format: keyof typeof BULK_INSERT_FORMATS;
}) => {
	const config = BULK_INSERT_FORMATS[format];
	const { closeOverlay, isOverlayOpen } = useOverlayStore();

	const { bulkInsertRecords, isInserting } = useBulkInsertRecords({
		tableName,
		schemaName: useTableSchemaName(),
	});

	const [textValue, setTextValue] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [parsedRecords, setParsedRecords] = useState<Record<string, unknown>[]>([]);
	const [parseError, setParseError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<"file" | "text">("file");

	const parse = (content: string) => {
		try {
			setParsedRecords(parseBulkData(content));
		} catch (error) {
			setParseError(error instanceof Error ? error.message : "Failed to parse data");
		}
	};

	const handleFormat = () => {
		setParseError(null);
		setParsedRecords([]);

		if (activeTab === "file" && selectedFile) {
			selectedFile.text().then(parse, () => setParseError("Failed to read file"));
		} else if (activeTab === "text" && textValue.trim()) {
			parse(textValue);
		} else {
			setParseError(activeTab === "file" ? "No file selected" : "Input is empty");
		}
	};

	const handleClose = () => {
		setTextValue("");
		setSelectedFile(null);
		setParsedRecords([]);
		setParseError(null);
		closeOverlay(config.overlay);
	};

	const handleInsert = () => {
		if (parsedRecords.length === 0) {
			setParseError("No records to insert");

			return;
		}

		bulkInsertRecords(parsedRecords, {
			format: format === "auto" ? undefined : format,
			onSuccess: handleClose,
		});
	};

	return (
		<SheetSidebar
			title={`${config.title}: ${tableName}`}
			open={isOverlayOpen(config.overlay)}
			onOpenChange={(open) => {
				if (!open) {
					handleClose();
				}
			}}
		>
			<div className="flex flex-col h-full gap-4">
				<Alert
					variant="info"
					title={config.hintTitle}
					message={config.hint}
				/>

				<Tabs
					value={activeTab}
					onValueChange={(value) => setActiveTab(value as "file" | "text")}
				>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="file">File</TabsTrigger>
						<TabsTrigger value="text">Text</TabsTrigger>
					</TabsList>

					<TabsContent
						value="file"
						className="flex-1 flex flex-col gap-4"
					>
						<div className="flex flex-col gap-2">
							<Label
								htmlFor={`${config.overlay}-file`}
								className="mb-2 text-sm font-medium text-foreground"
							>
								{config.fileLabel}
							</Label>
							<input
								id={`${config.overlay}-file`}
								type="file"
								accept={config.accept}
								onChange={(e) => {
									const file = e.target.files?.[0];

									if (file) {
										setSelectedFile(file);
										setParsedRecords([]);
										setParseError(null);
									}
								}}
								disabled={isInserting}
								className="text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer disabled:opacity-50"
							/>
						</div>
					</TabsContent>

					<TabsContent
						value="text"
						className="flex-1 flex flex-col gap-4"
					>
						<div className="flex-1 flex flex-col">
							<Label
								htmlFor={`${config.overlay}-text`}
								className="mb-2 text-sm font-medium text-foreground"
							>
								Data Input
							</Label>
							<Textarea
								id={`${config.overlay}-text`}
								value={textValue}
								onChange={(e) => {
									setTextValue(e.target.value);
									setParsedRecords([]);
									setParseError(null);
								}}
								placeholder={config.placeholder}
								className="flex-1 resize-none font-mono text-sm"
								disabled={isInserting}
							/>
						</div>
					</TabsContent>
				</Tabs>

				{parseError && (
					<Alert
						variant="error"
						title="Parse Error"
						message={parseError}
					/>
				)}

				{parsedRecords.length > 0 && (
					<Alert
						variant="success"
						title="Ready to Insert"
						message={`${parsedRecords.length} record${parsedRecords.length !== 1 ? "s" : ""} parsed successfully`}
					/>
				)}

				<div className="flex justify-between gap-2">
					<Button
						variant="secondary"
						size="lg"
						onClick={handleFormat}
						disabled={activeTab === "file" ? !selectedFile : !textValue.trim() || isInserting}
					>
						Format
					</Button>
					<div className="flex gap-2">
						<SheetClose
							asChild
							onClick={handleClose}
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
