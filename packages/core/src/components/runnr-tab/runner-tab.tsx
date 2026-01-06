import { IconCodeDots, IconHeart, IconHeartFilled, IconTable } from "@tabler/icons-react";
import {
	//  AlignLeft,
	Command,
	LucideCornerDownLeft,
} from "lucide-react";
import * as monaco from "monaco-editor";
import { useQueryState } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecuteQueryResponse } from "server/src/dao/query.dao";
import { toast } from "sonner";
import { QueryResultContainer } from "@/components/runnr-tab/query-result-container";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useExecuteQuery } from "@/hooks/use-execute-query";
import { useQueriesStore } from "@/stores/queries.store";
import { CONSTANTS } from "@/utils/constants";
import { PGSQL_PLACEHOLDER_QUERY } from "@/utils/constants/placeholders";
import {
	BUILTIN_FUNCTIONS,
	BUILTIN_TYPES,
	DATA_TYPES,
	FUNCTIONS,
	KEYWORDS,
	OPERATORS,
	SUGGESTIONS,
} from "@/utils/constants/runner-editor";

// todo: view the query result in a table
// todo: the syntax error in the editor should be shown in the editor
// todo: run the query via the button and the Ctrl/Cmd+Enter shortcut
// todo: format the query
// todo: fix focus bug, when saving it loses focus
// todo: fetch the tables and show them in the suggestions
// todo: use custom fetcher/axios function for the queries
// todo: export the query result as a CSV, JSON, Markdown or Excel file

export const RunnerTab = ({ queryId }: { queryId?: string }) => {
	const [showAs, setShowAs] = useQueryState(CONSTANTS.RUNNER_STATE_KEYS.SHOW_AS);
	const [queryResult, setQueryResult] = useState<ExecuteQueryResponse | null>(null);
	const { getQuery, updateQuery, toggleFavorite } = useQueriesStore();
	const query = queryId ? getQuery(queryId) : null;
	const isFavorite = query?.isFavorite ?? false;
	const { executeQuery, isExecutingQuery } = useExecuteQuery();
	const [editorInstance, setEditor] =
		useState<monaco.editor.IStandaloneCodeEditor | null>(null);
	const monacoEl = useRef<HTMLDivElement>(null);
	const [isSaving, setIsSaving] = useState(false);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const getInitialQuery = useCallback(() => {
		if (!query) return PGSQL_PLACEHOLDER_QUERY;
		return query?.query ?? PGSQL_PLACEHOLDER_QUERY;
	}, [query]);

	// Helper function you can call anytime
	const getCurrentQuery = () => {
		return editorInstance?.getValue() ?? "";
	};

	// Debounced save function
	const debouncedSave = useCallback(
		(value: string) => {
			if (!queryId) return;

			// Clear existing timeout
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}

			// Show saving state immediately
			setIsSaving(true);

			// Set new timeout
			saveTimeoutRef.current = setTimeout(() => {
				updateQuery(queryId, { query: value });
				setIsSaving(false);
				saveTimeoutRef.current = null;
			}, 500); // 500ms debounce delay
		},
		[queryId, updateQuery],
	);

	// Execute query function
	const handleExecuteQuery = useCallback(
		async (query: string) => {
			if (!query.trim()) {
				toast.error("Query is empty!");
				return;
			}

			executeQuery({ query, page: 1, pageSize: 50 }).then((result) => {
				setQueryResult(result);
			});
		},
		[executeQuery],
	);

	// Handler for button click
	const handleButtonClick = useCallback(() => {
		const query = editorInstance?.getValue() ?? "";
		if (!query.trim()) {
			toast.error("Query is empty!");
			return;
		}

		handleExecuteQuery(query);
	}, [handleExecuteQuery, editorInstance]);

	useEffect(() => {
		if (!monacoEl.current) return;

		// Register PostgreSQL language
		monaco.languages.register({ id: "pgsql" });

		// Define syntax highlighting tokens
		monaco.languages.setMonarchTokensProvider("pgsql", {
			defaultToken: "",
			tokenPostfix: ".sql",
			ignoreCase: true,

			keywords: KEYWORDS,
			operators: OPERATORS,
			builtinFunctions: BUILTIN_FUNCTIONS,

			builtinTypes: BUILTIN_TYPES,

			tokenizer: {
				root: [
					{ include: "@comments" },
					{ include: "@whitespace" },
					{ include: "@numbers" },
					{ include: "@strings" },
					{ include: "@complexIdentifiers" },
					[/[;,.]/, "delimiter"],
					[/[()]/, "@brackets"],
					[
						/[\w@#$]+/,
						{
							cases: {
								"@keywords": "keyword",
								"@operators": "operator",
								"@builtinFunctions": "predefined",
								"@builtinTypes": "type",
								"@default": "identifier",
							},
						},
					],
					[/[<>=!%&+\-*/|~^]/, "operator"],
				],

				whitespace: [[/\s+/, "white"]],

				comments: [
					[/--+.*/, "comment"],
					[/\/\*/, { token: "comment.quote", next: "@comment" }],
				],

				comment: [
					[/[^*/]+/, "comment"],
					[/\*\//, { token: "comment.quote", next: "@pop" }],
					[/./, "comment"],
				],

				numbers: [
					[/0[xX][0-9a-fA-F]*/, "number"],
					[/[$][+-]*\d*(\.\d*)?/, "number"],
					[/((\d+(\.\d*)?)|(\.\d+))([eE][-+]?\d+)?/, "number"],
				],

				strings: [
					[/'/, { token: "string", next: "@string" }],
					[/"/, { token: "string.double", next: "@stringDouble" }],
				],

				string: [
					[/[^']+/, "string"],
					[/''/, "string"],
					[/'/, { token: "string", next: "@pop" }],
				],

				stringDouble: [
					[/[^"]+/, "string.double"],
					[/""/, "string.double"],
					[/"/, { token: "string.double", next: "@pop" }],
				],

				complexIdentifiers: [
					[/"/, { token: "identifier.quote", next: "@quotedIdentifier" }],
				],

				quotedIdentifier: [
					[/[^"]+/, "identifier"],
					[/""/, "identifier"],
					[/"/, { token: "identifier.quote", next: "@pop" }],
				],
			},
		});

		// Configure autocomplete
		monaco.languages.registerCompletionItemProvider("pgsql", {
			provideCompletionItems: (model, position) => {
				const word = model.getWordUntilPosition(position);
				const range = {
					startLineNumber: position.lineNumber,
					endLineNumber: position.lineNumber,
					startColumn: word.startColumn,
					endColumn: word.endColumn,
				};

				const suggestions = [
					// SQL Keywords
					...SUGGESTIONS.map((kw) => ({
						label: kw,
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: kw,
						range,
					})),

					// Functions
					...FUNCTIONS.map((fn) => ({
						label: fn,
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: fn.includes("(*)") ? fn : fn.replace("()", "($0)"),
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range,
					})),

					// Data Types
					...DATA_TYPES.map((type) => ({
						label: type,
						kind: monaco.languages.CompletionItemKind.TypeParameter,
						insertText: type,
						range,
					})),

					// Snippets
					{
						label: "select-template",
						kind: monaco.languages.CompletionItemKind.Snippet,
						insertText: [
							"SELECT ${1:columns}",
							"FROM ${2:table}",
							"WHERE ${3:condition};",
						].join("\n"),
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						documentation: "SELECT statement template",
						range,
					},
					{
						label: "create-table-template",
						kind: monaco.languages.CompletionItemKind.Snippet,
						insertText: [
							"CREATE TABLE ${1:table_name} (",
							"    ${2:id} SERIAL PRIMARY KEY,",
							"    ${3:column_name} ${4:VARCHAR(255)} ${5:NOT NULL},",
							"    created_at TIMESTAMP DEFAULT NOW()",
							");",
						].join("\n"),
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						documentation: "CREATE TABLE template",
						range,
					},
					{
						label: "insert-template",
						kind: monaco.languages.CompletionItemKind.Snippet,
						insertText: [
							"INSERT INTO ${1:table} (${2:columns})",
							"VALUES (${3:values})",
							"RETURNING *;",
						].join("\n"),
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						documentation: "INSERT statement template",
						range,
					},
				];

				return { suggestions };
			},
		});

		// Create editor instance
		const editorInstance = monaco.editor.create(monacoEl.current, {
			value: getInitialQuery(),
			language: "pgsql",
			theme: "vs-dark",
			fontSize: 14,
			minimap: { enabled: false },
			lineNumbers: "on",
			roundedSelection: true,
			scrollBeyondLastLine: false,
			scrollbar: {
				horizontal: "hidden",
				vertical: "hidden",
				useShadows: false,
				verticalHasArrows: false,
				horizontalHasArrows: false,
				arrowSize: 0,
			},
			automaticLayout: true,
			tabSize: 4,
			insertSpaces: true,
			wordWrap: "on",
			folding: true,
			bracketPairColorization: {
				enabled: true,
			},
			suggest: {
				showKeywords: true,
				showSnippets: true,
			},
			quickSuggestions: {
				other: true,
				comments: false,
				strings: false,
			},
		});

		// Ctrl/Cmd+Enter to run query
		editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
			const query = editorInstance.getValue();
			if (!query.trim()) {
				toast.error("Query is empty!");
				return;
			}

			executeQuery(query);
		});

		// Listen to editor content changes for auto-save
		const disposable = editorInstance.onDidChangeModelContent(() => {
			const value = editorInstance.getValue();
			debouncedSave(value);
		});

		setEditor(editorInstance);

		// Cleanup function
		return () => {
			disposable.dispose();
			// Clear pending save timeout
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
			editorInstance.dispose();
		};
	}, [debouncedSave, getInitialQuery, executeQuery]);

	const handleFavorite = useCallback(() => {
		if (!queryId) return;
		toggleFavorite(queryId);
	}, [toggleFavorite, queryId]);

	return (
		<div className="flex-1 relative w-full flex flex-col bg-gray-900">
			<header className="max-h-8 overflow-hidden border-b border-zinc-800 w-full flex items-center justify-between bg-black sticky top-0 left-0 right-0 z-0">
				<div className="flex items-center">
					<Button
						type="button"
						variant="default"
						className="h-8! border-l-0 border-y-0 border-r border-black rounded-none bg-green-700 text-white hover:bg-green-800 gap-1 disabled:opacity-50"
						onClick={handleButtonClick}
						disabled={isExecutingQuery}
						aria-label="Run the query"
					>
						Run
						<Command className="size-3" />
						<LucideCornerDownLeft className="size-3" />
					</Button>

					{/* <Button
						type="button"
						variant="ghost"
						className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
						aria-label="Format the query"
					>
						Format <AlignLeft className="size-3" />
					</Button> */}

					<Button
						type="button"
						variant="ghost"
						className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
						aria-label="Favorite the query"
						onClick={handleFavorite}
					>
						{isFavorite ? (
							<>
								Unfavorite
								<IconHeartFilled className="size-3" />
							</>
						) : (
							<>
								Favorite
								<IconHeart className="size-3" />
							</>
						)}
					</Button>

					{/* <Button
						type="button"
						variant="ghost"
						className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
						aria-label="Export the query"
					>
						Export <Download className="size-3" />
					</Button> */}

					{isSaving && queryId && (
						<span className="px-3 text-xs text-green-600 animate-pulse">Saving...</span>
					)}
					{!isSaving && queryId && getCurrentQuery().trim().length > 0 && (
						<span className="px-3 text-xs text-green-600">Saved</span>
					)}
				</div>

				<div className="flex items-center">
					{queryResult && (
						<div className="flex items-center gap-1 px-2">
							<span className="text-xs text-gray-500">
								{queryResult.duration.toFixed(2)}ms
							</span>
							<span className="text-xs text-gray-500">•</span>
							<span className="text-xs text-gray-500">{queryResult.rowCount} rows</span>
						</div>
					)}

					<ToggleGroup
						type="single"
						variant="ghost"
						onValueChange={(value) => {
							if (value === showAs) return;
							setShowAs(value);
						}}
						value={showAs ?? undefined}
						className="h-8! rounded-none! border-l!"
					>
						<Tooltip>
							<TooltipTrigger asChild>
								<ToggleGroupItem
									value="table"
									aria-label="Toggle table"
									className="rounded-none! h-8! aspect-square!"
									data-selected={showAs === "table"}
								>
									<IconTable />
								</ToggleGroupItem>
							</TooltipTrigger>
							<TooltipContent>
								<p>View as a table</p>
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<ToggleGroupItem
									value="json"
									aria-label="Toggle JSON"
									className="rounded-none! h-8! aspect-square!"
									data-selected={showAs === "json"}
								>
									<IconCodeDots />
								</ToggleGroupItem>
							</TooltipTrigger>
							<TooltipContent>
								<p>View as a JSON</p>
							</TooltipContent>
						</Tooltip>
					</ToggleGroup>
				</div>
			</header>

			<div
				ref={monacoEl}
				className="flex-1 min-h-0"
			/>

			<QueryResultContainer
				results={queryResult}
				isLoading={isExecutingQuery}
			/>
		</div>
	);
};
