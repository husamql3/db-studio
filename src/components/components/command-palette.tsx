"use client";

import {
	ArrowUpDown,
	Brain,
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
	Trash2,
	Upload,
	Users,
	Wand2,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { useActiveTableStore } from "@/stores/active-table.store";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { useSheetStore } from "@/stores/sheet.store";

export function CommandPalette() {
	const { openSheet } = useSheetStore();
	const { toggleSidebarOpen, toggleSidebarPinned, sidebar } =
		usePersonalPreferencesStore();
	const { activeTable, setActiveTable } = useActiveTableStore();
	const { tablesList, isLoadingTables } = useTablesList();
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((open) => !open);
			}
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, []);

	const handleAction = (action: () => void, message?: string) => {
		setOpen(false);
		action();
		if (message) {
			toast.success(message);
		}
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={setOpen}
		>
			<CommandInput placeholder="Search commands, tables, or ask AI..." />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>

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
									description: "Get AI-powered explanations of your database structure",
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
							handleAction(() => openSheet("add-row"), "Opening add row form")
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

				{/* Tables Navigation */}
				{!isLoadingTables && tablesList && tablesList.length > 0 && (
					<>
						<CommandSeparator />
						<CommandGroup heading="Navigate to Table">
							{tablesList.map((table) => (
								<CommandItem
									key={table.tableName}
									onSelect={() =>
										handleAction(
											() => setActiveTable(table.tableName),
											`Navigated to ${table.tableName}`,
										)
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
						</CommandGroup>
					</>
				)}
			</CommandList>
		</CommandDialog>
	);
}
