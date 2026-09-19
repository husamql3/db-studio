"use client";

import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
	CommandShortcut,
} from "@db-studio/ui/command";
import { Kbd } from "@db-studio/ui/kbd";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import {
	Brain,
	ChevronLeft,
	Code,
	Columns2,
	Copy,
	Database,
	Download,
	GitBranch,
	KeyRound,
	MessageSquare,
	Moon,
	Pin,
	PinOff,
	Plus,
	RotateCw,
	Search,
	Settings,
	Sidebar,
	Sparkles,
	Sun,
	Table2,
	Upload,
} from "lucide-react";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useAssistantRequestStore } from "@/features/ai-assistant";
import { useExportFile, useTablesList } from "@/features/tables";
import { useCopyTableSchema } from "@/hooks/use-copy-table-schema";
import { useIsSchemaless } from "@/hooks/use-is-schemaless";
import { useTheme } from "@/hooks/use-theme";
import { posthogAnalytics } from "@/lib/posthog";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

type Mode = "all" | "tables";

const NO_TABLE_HINT = "Select a table first";
const SCHEMALESS_HINT = "Not available for schemaless databases";

export function CommandPalette() {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const routeParams = useParams({ strict: false });
	const activeTable = (routeParams as { table?: string }).table ?? null;
	const { dbType } = useDatabaseStore();
	const { openOverlay } = useOverlayStore();
	const { toggleSidebarOpen, toggleSidebarPinned, sidebar } = usePersonalPreferencesStore();
	const { toggleTheme, isDark } = useTheme();
	const { tablesList, isLoadingTablesList, errorTablesList } = useTablesList();
	const { exportFile, isExportingFile } = useExportFile();
	const { copyTableSchema, isCopyingSchema } = useCopyTableSchema();
	const { requestAssistant } = useAssistantRequestStore();

	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<Mode>("all");
	const [inputValue, setInputValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const isRedis = dbType === "redis";
	const isSchemaless = useIsSchemaless();
	// Create-table targets SQL-style schemas. Schemaless databases (MongoDB
	// collections, Redis keys) get their own entry points instead.
	const canCreateTable = !isSchemaless;
	// Record and schema sheets mount per-screen (table-screen.tsx,
	// schema-screen.tsx), so those commands only run on their own screen.
	// Schema DDL additionally needs a database with real schemas.
	const onTableScreen = pathname.startsWith("/table/");
	const onSchemaScreen = pathname.startsWith("/schema/");
	const canEditRecords = Boolean(activeTable) && onTableScreen;
	const recordsHint = !activeTable ? NO_TABLE_HINT : "Open the table data screen first";
	const canEditSchema = Boolean(activeTable) && onSchemaScreen && !isSchemaless;
	const schemaHint = isSchemaless
		? SCHEMALESS_HINT
		: !activeTable
			? NO_TABLE_HINT
			: "Open the table schema screen first";
	const isMac =
		typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);

	const handleOpenChange = (isOpen: boolean) => {
		setOpen(isOpen);
		// Reset state when dialog closes
		if (!isOpen) {
			setMode("all");
			setInputValue("");
		}
	};

	const handleAction = (action: () => void) => {
		// Go through handleOpenChange so mode/input reset on every close,
		// including closes triggered here instead of by the dialog itself.
		handleOpenChange(false);
		action();
	};

	const switchToTablesMode = useCallback(() => {
		setMode("tables");
		setInputValue("");
		// Focus input after mode switch
		setTimeout(() => inputRef.current?.focus(), 0);
	}, []);

	const switchToAllMode = useCallback(() => {
		setMode("all");
		setInputValue("");
		setTimeout(() => inputRef.current?.focus(), 0);
	}, []);

	// Handle input changes - detect mode triggers
	const handleInputChange = (value: string) => {
		// Detect ">" prefix to switch to tables mode, keeping anything typed
		// after it (fast typing and pastes arrive as a single value).
		if (mode === "all" && value.startsWith(">")) {
			switchToTablesMode();
			setInputValue(value.slice(1));
			return;
		}
		// Also detect "table " or "tables " as triggers
		if (
			mode === "all" &&
			(value.toLowerCase() === "table " || value.toLowerCase() === "tables ")
		) {
			switchToTablesMode();
			return;
		}
		setInputValue(value);
	};

	// Backspace on empty input goes back to "all" mode. Escape is left to the
	// dialog so it always closes the palette.
	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Backspace" && inputValue === "" && mode === "tables") {
			e.preventDefault();
			switchToAllMode();
		}
	};

	const handleNavigateToTable = (tableName: string) => {
		handleAction(() => {
			if (dbType) {
				posthogAnalytics.capture("table_viewed", { db_type: dbType });
			}
			// Reset search params: sort/filter/cursor keys from the previous
			// table must not leak into the newly opened one.
			navigate({ to: "/table/$table", params: { table: tableName }, search: {} });
		});
	};

	const askAssistant = (prompt: string) => {
		handleAction(() => {
			requestAssistant(prompt);
			openOverlay("chat.assistant");
		});
	};

	// Global toggle. Enabled on form tags and content-editables so the palette
	// also opens while another editor is focused. Events from inside the Monaco
	// surface are ignored so its Ctrl/Cmd+K chord prefix keeps working; the
	// query editor binds Ctrl/Cmd+Enter, Ctrl/Cmd+Shift+F and Ctrl/Cmd+S, so
	// there is nothing else to collide with.
	useHotkeys(
		"ctrl+k, meta+k",
		(event) => {
			if ((event.target as HTMLElement | null)?.closest?.(".monaco-editor")) return;
			event.preventDefault();
			setOpen((prev) => !prev);
		},
		{ enableOnFormTags: true, enableOnContentEditable: true },
	);

	const placeholder =
		mode === "all" ? "Search commands... (type > for tables)" : "Search tables...";

	return (
		<CommandDialog
			open={open}
			onOpenChange={handleOpenChange}
		>
			{/* Custom input area with mode badge */}
			<div className="flex items-center border-b border-input px-2 gap-2 w-full">
				{/* Mode indicator badge */}
				{mode === "tables" && (
					<button
						type="button"
						onClick={switchToAllMode}
						aria-label="Back to all commands"
						className="flex items-center gap-1.5 h-8! rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-all hover:bg-primary/20 shrink-0"
					>
						<Table2 className="size-3.5" />
						<span>Tables</span>
						<ChevronLeft className="size-3 opacity-60" />
					</button>
				)}
				<CommandInput
					ref={inputRef}
					placeholder={placeholder}
					value={inputValue}
					onValueChange={handleInputChange}
					onKeyDown={handleKeyDown}
					className="border-0 px-0"
				/>
			</div>
			<CommandList>
				<CommandEmpty>
					{mode === "tables" ? "No tables found." : "No results found."}
				</CommandEmpty>

				{/* Tables Mode - Only show tables */}
				{mode === "tables" && !isLoadingTablesList && !errorTablesList && tablesList && (
					<CommandGroup heading="Tables">
						{tablesList.length === 0 ? (
							<div className="py-6 text-center text-sm text-muted-foreground">
								No tables in database
							</div>
						) : (
							tablesList.map((table) => (
								<CommandItem
									key={table.tableName}
									value={table.tableName}
									onSelect={() => handleNavigateToTable(table.tableName)}
								>
									<Database className="mr-2 size-4 text-primary" />
									<div className="flex flex-1 items-center justify-between">
										<span className="font-medium">{table.tableName}</span>
										<span className="text-xs text-muted-foreground">
											{table.rowCount} {table.rowCount === 1 ? "row" : "rows"}
										</span>
									</div>
								</CommandItem>
							))
						)}
					</CommandGroup>
				)}
				{mode === "tables" && isLoadingTablesList && (
					<div className="py-6 text-center text-sm text-muted-foreground">
						Loading tables...
					</div>
				)}
				{mode === "tables" && errorTablesList && (
					<div className="py-6 text-center text-sm text-muted-foreground">
						Failed to load tables.
					</div>
				)}

				{/* All Mode - Show everything */}
				{mode === "all" && (
					<>
						{/* Quick Access - Tables shortcut */}
						{!isRedis && (
							<>
								<CommandGroup heading="Quick Access">
									<CommandItem
										onSelect={switchToTablesMode}
										keywords={["tables", ">", "go to table"]}
										className="group"
									>
										<Search className="mr-2 size-4 text-primary" />
										<div className="flex flex-1 items-center justify-between">
											<div className="flex flex-col">
												<span>Search Tables</span>
												<span className="text-xs text-muted-foreground">
													Navigate to any table quickly
												</span>
											</div>
											<CommandShortcut>&gt;</CommandShortcut>
										</div>
									</CommandItem>
								</CommandGroup>

								<CommandSeparator />
							</>
						)}

						{/* Navigation */}
						<CommandGroup heading="Go to">
							{!isRedis && (
								<CommandItem
									onSelect={() => handleAction(() => navigate({ to: "/" }))}
									keywords={["go", "navigate", "home", "tables"]}
								>
									<Table2 className="mr-2 size-4" />
									<div className="flex flex-col">
										<span>Go to Tables</span>
										<span className="text-xs text-muted-foreground">
											Open the tables overview
										</span>
									</div>
								</CommandItem>
							)}
							<CommandItem
								onSelect={() => handleAction(() => navigate({ to: "/runner" }))}
								keywords={["go", "navigate", "sql", "query", "runner", "editor"]}
							>
								<Code className="mr-2 size-4" />
								<div className="flex flex-col">
									<span>Go to Query Runner</span>
									<span className="text-xs text-muted-foreground">
										Write and execute queries
									</span>
								</div>
							</CommandItem>
							{!isRedis && (
								<CommandItem
									disabled={!activeTable || isSchemaless}
									onSelect={() => {
										if (!activeTable || isSchemaless) return;
										const table = activeTable;
										handleAction(() =>
											navigate({
												to: "/schema/$table",
												params: { table },
												search: {},
											}),
										);
									}}
									keywords={["go", "navigate", "schema", "columns"]}
								>
									<GitBranch className="mr-2 size-4" />
									<div className="flex flex-col">
										<span>Go to Schema</span>
										<span className="text-xs text-muted-foreground">
											{isSchemaless
												? SCHEMALESS_HINT
												: activeTable
													? `View the schema of ${activeTable}`
													: NO_TABLE_HINT}
										</span>
									</div>
								</CommandItem>
							)}
							{isRedis && (
								<CommandItem
									onSelect={() => handleAction(() => navigate({ to: "/browser" }))}
									keywords={["go", "navigate", "redis", "browser", "keys"]}
								>
									<Database className="mr-2 size-4" />
									<div className="flex flex-col">
										<span>Go to Redis Browser</span>
										<span className="text-xs text-muted-foreground">
											Browse keys across logical databases
										</span>
									</div>
								</CommandItem>
							)}
						</CommandGroup>

						<CommandSeparator />

						{/* AI Assistant Section */}
						<CommandGroup heading="AI Assistant">
							<CommandItem
								onSelect={() => handleAction(() => openOverlay("chat.assistant"))}
								keywords={["ai", "assistant", "chat", "help"]}
							>
								<MessageSquare className="mr-2 size-4" />
								<div className="flex flex-col">
									<span>Chat with AI Assistant</span>
									<span className="text-xs text-muted-foreground">
										Ask questions about your database
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									askAssistant(
										"Generate a query for this database. Ask me for the goal if it is unclear.",
									)
								}
								keywords={["ai", "generate", "sql", "query", "write"]}
							>
								<Sparkles className="mr-2 size-4" />
								<div className="flex flex-col">
									<span>Generate SQL with AI</span>
									<span className="text-xs text-muted-foreground">
										Create queries using natural language
									</span>
								</div>
							</CommandItem>
							<CommandItem
								disabled={!activeTable || isSchemaless}
								onSelect={() => {
									if (!activeTable || isSchemaless) return;
									askAssistant(
										`Explain the schema of table "${activeTable}": what each column stores and how it relates to other tables.`,
									);
								}}
								keywords={["ai", "explain", "schema", "table", "understand"]}
							>
								<Brain className="mr-2 size-4" />
								<div className="flex flex-col">
									<span>Explain Table Schema</span>
									<span className="text-xs text-muted-foreground">
										{isSchemaless
											? SCHEMALESS_HINT
											: activeTable
												? `Understand the structure of ${activeTable} with AI`
												: NO_TABLE_HINT}
									</span>
								</div>
							</CommandItem>
						</CommandGroup>

						<CommandSeparator />

						{/* Database Actions */}
						<CommandGroup heading="Database Actions">
							{canCreateTable && (
								<CommandItem
									onSelect={() =>
										handleAction(() => openOverlay("table-builder.create-table"))
									}
									keywords={["create", "new", "table"]}
								>
									<Plus className="mr-2 size-4" />
									<div className="flex flex-col">
										<span>Create New Table</span>
										<span className="text-xs text-muted-foreground">
											Design and create a new database table
										</span>
									</div>
								</CommandItem>
							)}
							{isRedis && (
								<CommandItem
									onSelect={() => handleAction(() => openOverlay("redis-browser.create-key"))}
									keywords={["create", "new", "redis", "key"]}
								>
									<KeyRound className="mr-2 size-4" />
									<div className="flex flex-col">
										<span>Create Redis Key</span>
										<span className="text-xs text-muted-foreground">
											Add a new key to the selected database
										</span>
									</div>
								</CommandItem>
							)}
							{!isRedis && (
								<>
									<CommandItem
										disabled={!canEditRecords}
										onSelect={() => handleAction(() => openOverlay("records.add-record"))}
										keywords={["add", "new", "row", "record", "insert"]}
									>
										<Plus className="mr-2 size-4" />
										<div className="flex flex-col">
											<span>Add New Row</span>
											<span className="text-xs text-muted-foreground">
												{canEditRecords
													? `Insert a new record into ${activeTable}`
													: recordsHint}
											</span>
										</div>
									</CommandItem>
									<CommandItem
										disabled={!canEditRecords}
										onSelect={() => handleAction(() => openOverlay("records.bulk-insert"))}
										keywords={["bulk", "insert", "import", "csv", "excel", "json"]}
									>
										<Upload className="mr-2 size-4" />
										<div className="flex flex-col">
											<span>Bulk Insert Records</span>
											<span className="text-xs text-muted-foreground">
												{canEditRecords
													? `Import many records into ${activeTable}`
													: recordsHint}
											</span>
										</div>
									</CommandItem>
									<CommandItem
										disabled={!canEditSchema}
										onSelect={() => handleAction(() => openOverlay("schema.add-column"))}
										keywords={["add", "new", "column", "schema"]}
									>
										<Columns2 className="mr-2 size-4" />
										<div className="flex flex-col">
											<span>Add Column</span>
											<span className="text-xs text-muted-foreground">
												{canEditSchema ? `Add a column to ${activeTable}` : schemaHint}
											</span>
										</div>
									</CommandItem>
									<CommandItem
										disabled={!activeTable || isExportingFile}
										onSelect={() => {
											if (!activeTable) return;
											const tableName = activeTable;
											handleAction(() => {
												void exportFile({ tableName, format: "csv" }).catch(() => undefined);
											});
										}}
										keywords={["export", "download", "csv"]}
									>
										<Download className="mr-2 size-4" />
										<div className="flex flex-col">
											<span>Export Table as CSV</span>
											<span className="text-xs text-muted-foreground">
												{activeTable ? `Download ${activeTable} as a CSV file` : NO_TABLE_HINT}
											</span>
										</div>
									</CommandItem>
									<CommandItem
										disabled={!activeTable || isExportingFile}
										onSelect={() => {
											if (!activeTable) return;
											const tableName = activeTable;
											handleAction(() => {
												void exportFile({ tableName, format: "json" }).catch(() => undefined);
											});
										}}
										keywords={["export", "download", "json"]}
									>
										<Download className="mr-2 size-4" />
										<div className="flex flex-col">
											<span>Export Table as JSON</span>
											<span className="text-xs text-muted-foreground">
												{activeTable
													? `Download ${activeTable} as a JSON file`
													: NO_TABLE_HINT}
											</span>
										</div>
									</CommandItem>
									<CommandItem
										disabled={!activeTable || isCopyingSchema || isSchemaless}
										onSelect={() => {
											if (!activeTable || isSchemaless) return;
											const tableName = activeTable;
											handleAction(() => {
												void copyTableSchema(tableName).catch(() => undefined);
											});
										}}
										keywords={["copy", "schema", "ddl", "clipboard"]}
									>
										<Copy className="mr-2 size-4" />
										<div className="flex flex-col">
											<span>Copy Table Schema</span>
											<span className="text-xs text-muted-foreground">
												{isSchemaless
													? SCHEMALESS_HINT
													: activeTable
														? `Copy the schema of ${activeTable} to the clipboard`
														: NO_TABLE_HINT}
											</span>
										</div>
									</CommandItem>
								</>
							)}
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										window.location.reload();
									})
								}
								keywords={["refresh", "reload", "restart"]}
							>
								<RotateCw className="mr-2 size-4" />
								<div className="flex flex-col">
									<span>Reload Application</span>
									<span className="text-xs text-muted-foreground">
										Reload all tables and data
									</span>
								</div>
							</CommandItem>
						</CommandGroup>

						<CommandSeparator />

						{/* View & Settings */}
						<CommandGroup heading="View & Settings">
							<CommandItem
								onSelect={() => handleAction(toggleSidebarOpen)}
								keywords={["sidebar", "show", "hide", "toggle", "view"]}
							>
								<Sidebar className="mr-2 size-4" />
								<div className="flex flex-col">
									<span>{sidebar.isOpen ? "Hide" : "Show"} Sidebar</span>
									<span className="text-xs text-muted-foreground">
										Toggle sidebar visibility
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() => handleAction(toggleSidebarPinned)}
								keywords={["sidebar", "pin", "unpin"]}
							>
								{sidebar.isPinned ? (
									<PinOff className="mr-2 size-4" />
								) : (
									<Pin className="mr-2 size-4" />
								)}
								<div className="flex flex-col">
									<span>{sidebar.isPinned ? "Unpin" : "Pin"} Sidebar</span>
									<span className="text-xs text-muted-foreground">
										Keep sidebar always visible
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() => handleAction(toggleTheme)}
								keywords={["theme", "dark", "light", "mode", "appearance"]}
							>
								{isDark ? <Sun className="mr-2 size-4" /> : <Moon className="mr-2 size-4" />}
								<div className="flex flex-col">
									<span>Switch to {isDark ? "Light" : "Dark"} Mode</span>
									<span className="text-xs text-muted-foreground">
										Toggle the application theme
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() => handleAction(() => openOverlay("settings.app"))}
								keywords={["settings", "preferences", "configure", "options"]}
							>
								<Settings className="mr-2 size-4" />
								<div className="flex flex-col">
									<span>Settings & Preferences</span>
									<span className="text-xs text-muted-foreground">
										Configure application settings
									</span>
								</div>
							</CommandItem>
						</CommandGroup>

						{/* Tables Navigation - Show top 5 tables in all mode */}
						{!isRedis &&
							!isLoadingTablesList &&
							!errorTablesList &&
							tablesList &&
							tablesList.length > 0 && (
								<>
									<CommandSeparator />
									<CommandGroup heading="Recent Tables">
										{tablesList.slice(0, 5).map((table) => (
											<CommandItem
												key={table.tableName}
												value={table.tableName}
												keywords={["table", "recent", table.tableName]}
												onSelect={() => handleNavigateToTable(table.tableName)}
											>
												<Database className="mr-2 size-4" />
												<div className="flex flex-col">
													<span>{table.tableName}</span>
													<span className="text-xs text-muted-foreground">
														{table.rowCount} {table.rowCount === 1 ? "row" : "rows"}
													</span>
												</div>
											</CommandItem>
										))}
										{tablesList.length > 5 && (
											<CommandItem
												onSelect={switchToTablesMode}
												className="text-muted-foreground"
											>
												<span className="text-xs">
													+{tablesList.length - 5} more tables — press{" "}
													<Kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">
														&gt;
													</Kbd>{" "}
													to see all
												</span>
											</CommandItem>
										)}
									</CommandGroup>
								</>
							)}
					</>
				)}
			</CommandList>
			<div
				aria-hidden="true"
				className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground"
			>
				<span className="flex items-center gap-1">
					<Kbd>↑</Kbd>
					<Kbd>↓</Kbd> to navigate
				</span>
				<span className="flex items-center gap-1">
					<Kbd>↵</Kbd> to select
				</span>
				<span className="flex items-center gap-1">
					<Kbd>esc</Kbd> to close
				</span>
				<span className="ml-auto flex items-center gap-1">
					<Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
					<Kbd>K</Kbd> to toggle
				</span>
			</div>
		</CommandDialog>
	);
}
