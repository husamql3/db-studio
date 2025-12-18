"use client";

import {
	ArrowUpDown,
	Brain,
	ChevronLeft,
	Code,
	Copy,
	Database,
	Download,
	Edit,
	Eye,
	FileText,
	Filter,
	GitBranch,
	Lightbulb,
	Lock,
	MessageSquare,
	Pin,
	PinOff,
	PlayCircle,
	Plus,
	RotateCw,
	Search,
	Settings,
	Sidebar,
	Sparkles,
	Table2,
	Trash2,
	Upload,
	Users,
	Wand2,
	Zap,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { useTablesList } from "@/hooks/use-tables-list";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { useSheetStore } from "@/stores/sheet.store";
import { CONSTANTS } from "@/utils/constants";

type Mode = "all" | "tables";

export function CommandPalette() {
	const [activeTable, setActiveTable] = useQueryState(CONSTANTS.ACTIVE_TABLE, {
		shallow: true,
	});
	const [, setActiveTab] = useQueryState(CONSTANTS.ACTIVE_TAB, {
		shallow: true,
	});
	const { openSheet } = useSheetStore();
	const { toggleSidebarOpen, toggleSidebarPinned, sidebar } =
		usePersonalPreferencesStore();
	const { tablesList, isLoadingTablesList } = useTablesList();
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<Mode>("all");
	const [inputValue, setInputValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const handleOpenChange = (isOpen: boolean) => {
		setOpen(isOpen);
		// Reset state when dialog closes
		if (!isOpen) {
			setMode("all");
			setInputValue("");
		}
	};

	const handleAction = (action: () => void, message?: string) => {
		setOpen(false);
		action();
		if (message) {
			toast.success(message);
		}
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
		// Detect ">" prefix to switch to tables mode
		if (mode === "all" && value === ">") {
			switchToTablesMode();
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

	// Handle keyboard events for going back
	const handleKeyDown = (e: KeyboardEvent) => {
		// Backspace on empty input goes back to "all" mode
		if (e.key === "Backspace" && inputValue === "" && mode === "tables") {
			e.preventDefault();
			switchToAllMode();
		}
		// Escape in tables mode goes back to "all" mode first
		if (e.key === "Escape" && mode === "tables") {
			e.preventDefault();
			e.stopPropagation();
			switchToAllMode();
		}
	};

	// Hotkeys for command palette
	useHotkeys("ctrl+k, meta+k", () => setOpen((open) => !open));

	const placeholder =
		mode === "all" ? "Search commands... (type > for tables)" : "Search tables...";

	return (
		<CommandDialog
			open={open}
			onOpenChange={handleOpenChange}
		>
			{/* Custom input area with mode badge */}
			<div className="flex items-center border-b border-input px-4 gap-2 w-full">
				{/* Mode indicator badge */}
				{mode === "tables" && (
					<button
						type="button"
						onClick={switchToAllMode}
						className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-all hover:bg-primary/20 hover:gap-2 shrink-0"
					>
						<Table2 className="h-3.5 w-3.5" />
						<span>Tables</span>
						<ChevronLeft className="h-3 w-3 opacity-60" />
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
				{mode === "tables" && !isLoadingTablesList && tablesList && (
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
									onSelect={() =>
										handleAction(
											() => setActiveTable(table.tableName),
											`Navigated to ${table.tableName}`,
										)
									}
								>
									<Database className="mr-2 h-4 w-4 text-primary" />
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

				{/* All Mode - Show everything */}
				{mode === "all" && (
					<>
						{/* Quick Access - Tables shortcut */}
						<CommandGroup heading="Quick Access">
							<CommandItem
								onSelect={switchToTablesMode}
								className="group"
							>
								<Table2 className="mr-2 h-4 w-4 text-primary" />
								<div className="flex flex-1 items-center justify-between">
									<div className="flex flex-col">
										<span>Search Tables</span>
										<span className="text-xs text-muted-foreground">
											Navigate to any table quickly
										</span>
									</div>
									<kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground group-hover:inline-block">
										&gt;
									</kbd>
								</div>
							</CommandItem>
						</CommandGroup>

						<CommandSeparator />

						{/* AI Assistant Section */}
						<CommandGroup heading="AI Assistant">
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("AI SQL Generator - Coming Soon!", {
											description: "Generate SQL queries with natural language",
										});
									})
								}
							>
								<Sparkles className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Generate SQL with AI</span>
									<span className="text-xs text-muted-foreground">
										Create queries using natural language
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("AI Table Designer - Coming Soon!", {
											description: "Design your database schema with AI assistance",
										});
									})
								}
							>
								<Wand2 className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>AI Table Designer</span>
									<span className="text-xs text-muted-foreground">
										Design tables with intelligent suggestions
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Schema Explainer - Coming Soon!", {
											description:
												"Get AI-powered explanations of your database structure",
										});
									})
								}
							>
								<Brain className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Explain Schema</span>
									<span className="text-xs text-muted-foreground">
										Understand your database structure with AI
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("AI Query Optimizer - Coming Soon!", {
											description: "Optimize your queries for better performance",
										});
									})
								}
							>
								<Zap className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Optimize Query</span>
									<span className="text-xs text-muted-foreground">
										Get performance optimization suggestions
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("AI Chat - Coming Soon!", {
											description: "Chat with AI about your database",
										});
									})
								}
							>
								<MessageSquare className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Chat with AI Assistant</span>
									<span className="text-xs text-muted-foreground">
										Ask questions about your database
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Smart Suggestions - Coming Soon!", {
											description: "Get AI-powered recommendations for your schema",
										});
									})
								}
							>
								<Lightbulb className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Get Schema Suggestions</span>
									<span className="text-xs text-muted-foreground">
										Improve your database design with AI insights
									</span>
								</div>
							</CommandItem>
						</CommandGroup>

						<CommandSeparator />

						{/* Database Actions */}
						<CommandGroup heading="Database Actions">
							<CommandItem onSelect={() => handleAction(() => openSheet("add-table"))}>
								<Plus className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Create New Table</span>
									<span className="text-xs text-muted-foreground">
										Design and create a new database table
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => openSheet("add-record"), "Opening add row form")
								}
								disabled={!activeTable}
							>
								<Plus className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Add New Row</span>
									<span className="text-xs text-muted-foreground">
										Insert a new record to {activeTable || "selected table"}
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										window.location.reload();
									}, "Refreshing database...")
								}
							>
								<RotateCw className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Refresh Database</span>
									<span className="text-xs text-muted-foreground">
										Reload all tables and data
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Export Feature - Coming Soon!", {
											description: "Export your data to CSV, JSON, or SQL",
										});
									})
								}
							>
								<Download className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Export Data</span>
									<span className="text-xs text-muted-foreground">
										Download table data as CSV, JSON, or SQL
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Import Feature - Coming Soon!", {
											description: "Import data from CSV, JSON, or SQL files",
										});
									})
								}
							>
								<Upload className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Import Data</span>
									<span className="text-xs text-muted-foreground">
										Upload and import data from files
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Backup Feature - Coming Soon!", {
											description: "Create a complete backup of your database",
										});
									})
								}
							>
								<Copy className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Backup Database</span>
									<span className="text-xs text-muted-foreground">
										Create a full database backup
									</span>
								</div>
							</CommandItem>
						</CommandGroup>

						<CommandSeparator />

						{/* Data Operations */}
						<CommandGroup heading="Data Operations">
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Advanced Search - Coming Soon!", {
											description: "Search across all tables",
										});
									})
								}
							>
								<Search className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Search Records</span>
									<span className="text-xs text-muted-foreground">
										Search across all tables and columns
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Filter Builder - Coming Soon!", {
											description: "Build complex filters for your data",
										});
									})
								}
								disabled={!activeTable}
							>
								<Filter className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Filter Data</span>
									<span className="text-xs text-muted-foreground">
										Apply advanced filters to current table
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Sort Options - Coming Soon!", {
											description: "Sort data by multiple columns",
										});
									})
								}
								disabled={!activeTable}
							>
								<ArrowUpDown className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Sort Data</span>
									<span className="text-xs text-muted-foreground">
										Sort by multiple columns
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Bulk Edit - Coming Soon!", {
											description: "Edit multiple records at once",
										});
									})
								}
								disabled={!activeTable}
							>
								<Edit className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Bulk Edit</span>
									<span className="text-xs text-muted-foreground">
										Update multiple records simultaneously
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Bulk Delete - Coming Soon!", {
											description: "Delete multiple records at once",
										});
									})
								}
							>
								<Trash2 className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Bulk Delete</span>
									<span className="text-xs text-muted-foreground">
										Remove multiple records at once
									</span>
								</div>
							</CommandItem>
						</CommandGroup>

						<CommandSeparator />

						{/* SQL & Schema */}
						<CommandGroup heading="SQL & Schema">
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("SQL Editor - Coming Soon!", {
											description: "Run custom SQL queries",
										});
									})
								}
							>
								<Code className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>SQL Editor</span>
									<span className="text-xs text-muted-foreground">
										Write and execute custom queries
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Query History - Coming Soon!", {
											description: "View your recent queries",
										});
									})
								}
							>
								<FileText className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Query History</span>
									<span className="text-xs text-muted-foreground">
										Access previously executed queries
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Schema Viewer - Coming Soon!", {
											description: "Visualize your database structure",
										});
									})
								}
							>
								<GitBranch className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>View Schema Diagram</span>
									<span className="text-xs text-muted-foreground">
										Visualize table relationships
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Generate SQL - Coming Soon!", {
											description: "Generate SQL for current table",
										});
									})
								}
								disabled={!activeTable}
							>
								<PlayCircle className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Generate Table SQL</span>
									<span className="text-xs text-muted-foreground">
										Get CREATE TABLE statement
									</span>
								</div>
							</CommandItem>
						</CommandGroup>

						<CommandSeparator />

						{/* Access & Security */}
						<CommandGroup heading="Access & Security">
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Permissions - Coming Soon!", {
											description: "Manage database permissions",
										});
									})
								}
							>
								<Lock className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Manage Permissions</span>
									<span className="text-xs text-muted-foreground">
										Control user access and privileges
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Users - Coming Soon!", {
											description: "Manage database users",
										});
									})
								}
							>
								<Users className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>User Management</span>
									<span className="text-xs text-muted-foreground">
										Add and manage database users
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Audit Log - Coming Soon!", {
											description: "View database activity logs",
										});
									})
								}
							>
								<Eye className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Audit Log</span>
									<span className="text-xs text-muted-foreground">
										Track all database changes
									</span>
								</div>
							</CommandItem>
						</CommandGroup>

						<CommandSeparator />

						{/* View & Settings */}
						<CommandGroup heading="View & Settings">
							<CommandItem
								onSelect={() => handleAction(toggleSidebarOpen, "Sidebar toggled")}
							>
								<Sidebar className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>{sidebar.isOpen ? "Hide" : "Show"} Sidebar</span>
									<span className="text-xs text-muted-foreground">
										Toggle sidebar visibility
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() => handleAction(toggleSidebarPinned, "Sidebar pin toggled")}
							>
								{sidebar.isPinned ? (
									<PinOff className="mr-2 h-4 w-4" />
								) : (
									<Pin className="mr-2 h-4 w-4" />
								)}
								<div className="flex flex-col">
									<span>{sidebar.isPinned ? "Unpin" : "Pin"} Sidebar</span>
									<span className="text-xs text-muted-foreground">
										Keep sidebar always visible
									</span>
								</div>
							</CommandItem>
							<CommandItem
								onSelect={() =>
									handleAction(() => {
										toast.info("Settings - Coming Soon!", {
											description: "Customize your DB Studio experience",
										});
									})
								}
							>
								<Settings className="mr-2 h-4 w-4" />
								<div className="flex flex-col">
									<span>Settings & Preferences</span>
									<span className="text-xs text-muted-foreground">
										Configure application settings
									</span>
								</div>
							</CommandItem>
						</CommandGroup>

						{/* Tables Navigation - Show top 5 tables in all mode */}
						{!isLoadingTablesList && tablesList && tablesList.length > 0 && (
							<>
								<CommandSeparator />
								<CommandGroup heading="Recent Tables">
									{tablesList.slice(0, 5).map((table) => (
										<CommandItem
											key={table.tableName}
											onSelect={() =>
												handleAction(() => {
													setActiveTab("table");
													setActiveTable(table.tableName);
												}, `Navigated to ${table.tableName}`)
											}
										>
											<Database className="mr-2 h-4 w-4" />
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
												<kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">
													&gt;
												</kbd>{" "}
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
		</CommandDialog>
	);
}
