import { useCallback, useRef, useState } from "react";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SheetClose } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBulkInsertRecords } from "@/hooks/use-bulk-insert-records";
import { useSheetStore } from "@/stores/sheet.store";
import { parseBulkData } from "@/utils/parse-bulk-data";

interface BulkInsertJsonSheetProps {
	tableName: string;
}

export const BulkInsertJsonSheet = ({ tableName }: BulkInsertJsonSheetProps) => {
	const { closeSheet, isSheetOpen } = useSheetStore();
	const { bulkInsertRecords, isInserting } = useBulkInsertRecords({ tableName });
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [textValue, setTextValue] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [parsedRecords, setParsedRecords] = useState<Record<string, unknown>[]>([]);
	const [parseError, setParseError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<"file" | "text">("file");

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			setSelectedFile(file);
			setParsedRecords([]);
			setParseError(null);
		}
	};

	const handleFormat = useCallback(() => {
		setParseError(null);
		setParsedRecords([]);

		try {
			if (activeTab === "file" && selectedFile) {
				const reader = new FileReader();
				reader.onload = (e) => {
					try {
						const content = e.target?.result as string;
						const records = parseBulkData(content);
						setParsedRecords(records);
					} catch (error) {
						setParseError(error instanceof Error ? error.message : "Failed to parse file");
					}
				};
				reader.readAsText(selectedFile);
			} else if (textValue.trim()) {
				const records = parseBulkData(textValue);
				setParsedRecords(records);
			} else {
				setParseError(activeTab === "file" ? "No file selected" : "Input is empty");
			}
		} catch (error) {
			setParseError(error instanceof Error ? error.message : "Failed to format data");
		}
	}, [textValue, selectedFile, activeTab]);

	const handleInsert = async () => {
		if (parsedRecords.length === 0) {
			setParseError("No records to insert");
			return;
		}

		try {
			await bulkInsertRecords(parsedRecords, {
				onSuccess: () => {
					setTextValue("");
					setSelectedFile(null);
					setParsedRecords([]);
					setParseError(null);
					closeSheet("bulk-insert-json");
				},
			});
		} catch (error) {
			console.error("Error inserting records:", error);
		}
	};

	const handleCancel = () => {
		setTextValue("");
		setSelectedFile(null);
		setParsedRecords([]);
		setParseError(null);
		closeSheet("bulk-insert-json");
	};

	return (
		<SheetSidebar
			title={`Add data from JSON into: ${tableName}`}
			open={isSheetOpen("bulk-insert-json")}
			onOpenChange={(open) => {
				if (!open) {
					handleCancel();
				}
			}}
		>
			<div className="flex flex-col h-full gap-4">
				{/* Info alert */}
				<Alert
					variant="info"
					title="JSON Import"
					message={
						'Enter JSON array or single object. Example: [{"name": "John", "age": 30}, {"name": "Jane", "age": 28}]'
					}
				/>

				{/* Tabs for file and text input */}
				<Tabs
					value={activeTab}
					onValueChange={(value) => setActiveTab(value as "file" | "text")}
				>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="file">File</TabsTrigger>
						<TabsTrigger value="text">Text</TabsTrigger>
					</TabsList>

					{/* File Tab */}
					<TabsContent
						value="file"
						className="flex-1 flex flex-col gap-4"
					>
						<div className="flex flex-col gap-2">
							<Label
								htmlFor="file-input"
								className="mb-2 text-sm font-medium text-zinc-300"
							>
								Select JSON file
							</Label>
							<input
								id="file-input"
								ref={fileInputRef}
								type="file"
								accept=".json"
								onChange={handleFileSelect}
								disabled={isInserting}
								className="text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-700 file:text-white hover:file:bg-zinc-600 cursor-pointer disabled:opacity-50"
							/>
						</div>
					</TabsContent>

					{/* Text Tab */}
					<TabsContent
						value="text"
						className="flex-1 flex flex-col gap-4"
					>
						<div className="flex-1 flex flex-col">
							<Label
								htmlFor="text-input"
								className="mb-2 text-sm font-medium text-zinc-300"
							>
								Data Input
							</Label>
							<Textarea
								id="text-input"
								value={textValue}
								onChange={(e) => {
									setTextValue(e.target.value);
									setParsedRecords([]);
									setParseError(null);
								}}
								placeholder={'[{"column1": "value1", "column2": "value2"}]'}
								className="flex-1 resize-none font-mono text-sm"
								disabled={isInserting}
							/>
						</div>
					</TabsContent>
				</Tabs>

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
