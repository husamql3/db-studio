// import * as monaco from "monaco-editor";
// import { useCallback, useEffect, useRef, useState } from "react";
// import { useQueriesStore } from "@/stores/queries.store";
// import { PGSQL_PLACEHOLDER_QUERY } from "@/utils/constants/placeholders";
// import {
// 	BUILTIN_FUNCTIONS,
// 	BUILTIN_TYPES,
// 	DATA_TYPES,
// 	FUNCTIONS,
// 	KEYWORDS,
// 	OPERATORS,
// 	SUGGESTIONS,
// } from "@/utils/constants/runner-editor";

// export const QueryEditor = ({ queryId }: { queryId?: string }) => {
// 	const monacoEl = useRef<HTMLDivElement>(null);
// 	const [editorInstance, setEditor] =
// 		useState<monaco.editor.IStandaloneCodeEditor | null>(null);
// 	const [_isSaving, setIsSaving] = useState(false);
// 	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// 	const { getQuery, updateQuery } = useQueriesStore();

// 	const getInitialQuery = useCallback(() => {
// 		if (!queryId) return PGSQL_PLACEHOLDER_QUERY;

// 		const query = getQuery(queryId);
// 		return query?.query ?? PGSQL_PLACEHOLDER_QUERY;
// 	}, [queryId, getQuery]);

// 	// Helper function you can call anytime
// 	const _getCurrentQuery = () => {
// 		return editorInstance?.getValue() ?? "";
// 	};

// 	// Debounced save function
// 	const debouncedSave = useCallback(
// 		(value: string) => {
// 			if (!queryId) return;

// 			// Clear existing timeout
// 			if (saveTimeoutRef.current) {
// 				clearTimeout(saveTimeoutRef.current);
// 			}

// 			// Show saving state immediately
// 			setIsSaving(true);

// 			// Set new timeout
// 			saveTimeoutRef.current = setTimeout(() => {
// 				updateQuery(queryId, { query: value });
// 				setIsSaving(false);
// 				saveTimeoutRef.current = null;
// 			}, 500); // 500ms debounce delay
// 		},
// 		[queryId, updateQuery],
// 	);

// 	useEffect(() => {
// 		if (!monacoEl.current) return;

// 		// Register PostgreSQL language
// 		monaco.languages.register({ id: "pgsql" });

// 		// Define syntax highlighting tokens
// 		monaco.languages.setMonarchTokensProvider("pgsql", {
// 			defaultToken: "",
// 			tokenPostfix: ".sql",
// 			ignoreCase: true,

// 			keywords: KEYWORDS,
// 			operators: OPERATORS,
// 			builtinFunctions: BUILTIN_FUNCTIONS,

// 			builtinTypes: BUILTIN_TYPES,

// 			tokenizer: {
// 				root: [
// 					{ include: "@comments" },
// 					{ include: "@whitespace" },
// 					{ include: "@numbers" },
// 					{ include: "@strings" },
// 					{ include: "@complexIdentifiers" },
// 					[/[;,.]/, "delimiter"],
// 					[/[()]/, "@brackets"],
// 					[
// 						/[\w@#$]+/,
// 						{
// 							cases: {
// 								"@keywords": "keyword",
// 								"@operators": "operator",
// 								"@builtinFunctions": "predefined",
// 								"@builtinTypes": "type",
// 								"@default": "identifier",
// 							},
// 						},
// 					],
// 					[/[<>=!%&+\-*/|~^]/, "operator"],
// 				],

// 				whitespace: [[/\s+/, "white"]],

// 				comments: [
// 					[/--+.*/, "comment"],
// 					[/\/\*/, { token: "comment.quote", next: "@comment" }],
// 				],

// 				comment: [
// 					[/[^*/]+/, "comment"],
// 					[/\*\//, { token: "comment.quote", next: "@pop" }],
// 					[/./, "comment"],
// 				],

// 				numbers: [
// 					[/0[xX][0-9a-fA-F]*/, "number"],
// 					[/[$][+-]*\d*(\.\d*)?/, "number"],
// 					[/((\d+(\.\d*)?)|(\.\d+))([eE][-+]?\d+)?/, "number"],
// 				],

// 				strings: [
// 					[/'/, { token: "string", next: "@string" }],
// 					[/"/, { token: "string.double", next: "@stringDouble" }],
// 				],

// 				string: [
// 					[/[^']+/, "string"],
// 					[/''/, "string"],
// 					[/'/, { token: "string", next: "@pop" }],
// 				],

// 				stringDouble: [
// 					[/[^"]+/, "string.double"],
// 					[/""/, "string.double"],
// 					[/"/, { token: "string.double", next: "@pop" }],
// 				],

// 				complexIdentifiers: [
// 					[/"/, { token: "identifier.quote", next: "@quotedIdentifier" }],
// 				],

// 				quotedIdentifier: [
// 					[/[^"]+/, "identifier"],
// 					[/""/, "identifier"],
// 					[/"/, { token: "identifier.quote", next: "@pop" }],
// 				],
// 			},
// 		});

// 		// Configure autocomplete
// 		monaco.languages.registerCompletionItemProvider("pgsql", {
// 			provideCompletionItems: (model, position) => {
// 				const word = model.getWordUntilPosition(position);
// 				const range = {
// 					startLineNumber: position.lineNumber,
// 					endLineNumber: position.lineNumber,
// 					startColumn: word.startColumn,
// 					endColumn: word.endColumn,
// 				};

// 				const suggestions = [
// 					// SQL Keywords
// 					...SUGGESTIONS.map((kw) => ({
// 						label: kw,
// 						kind: monaco.languages.CompletionItemKind.Keyword,
// 						insertText: kw,
// 						range,
// 					})),

// 					// Functions
// 					...FUNCTIONS.map((fn) => ({
// 						label: fn,
// 						kind: monaco.languages.CompletionItemKind.Function,
// 						insertText: fn.includes("(*)") ? fn : fn.replace("()", "($0)"),
// 						insertTextRules:
// 							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
// 						range,
// 					})),

// 					// Data Types
// 					...DATA_TYPES.map((type) => ({
// 						label: type,
// 						kind: monaco.languages.CompletionItemKind.TypeParameter,
// 						insertText: type,
// 						range,
// 					})),

// 					// Snippets
// 					{
// 						label: "select-template",
// 						kind: monaco.languages.CompletionItemKind.Snippet,
// 						insertText: [
// 							"SELECT ${1:columns}",
// 							"FROM ${2:table}",
// 							"WHERE ${3:condition};",
// 						].join("\n"),
// 						insertTextRules:
// 							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
// 						documentation: "SELECT statement template",
// 						range,
// 					},
// 					{
// 						label: "create-table-template",
// 						kind: monaco.languages.CompletionItemKind.Snippet,
// 						insertText: [
// 							"CREATE TABLE ${1:table_name} (",
// 							"    ${2:id} SERIAL PRIMARY KEY,",
// 							"    ${3:column_name} ${4:VARCHAR(255)} ${5:NOT NULL},",
// 							"    created_at TIMESTAMP DEFAULT NOW()",
// 							");",
// 						].join("\n"),
// 						insertTextRules:
// 							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
// 						documentation: "CREATE TABLE template",
// 						range,
// 					},
// 					{
// 						label: "insert-template",
// 						kind: monaco.languages.CompletionItemKind.Snippet,
// 						insertText: [
// 							"INSERT INTO ${1:table} (${2:columns})",
// 							"VALUES (${3:values})",
// 							"RETURNING *;",
// 						].join("\n"),
// 						insertTextRules:
// 							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
// 						documentation: "INSERT statement template",
// 						range,
// 					},
// 				];

// 				return { suggestions };
// 			},
// 		});

// 		// Create editor instance
// 		const editorInstance = monaco.editor.create(monacoEl.current, {
// 			value: getInitialQuery(),
// 			language: "pgsql",
// 			theme: "vs-dark",
// 			fontSize: 14,
// 			minimap: { enabled: false },
// 			lineNumbers: "on",
// 			roundedSelection: true,
// 			scrollBeyondLastLine: false,
// 			scrollbar: {
// 				horizontal: "hidden",
// 				vertical: "hidden",
// 				useShadows: false,
// 				verticalHasArrows: false,
// 				horizontalHasArrows: false,
// 				arrowSize: 0,
// 			},
// 			automaticLayout: true,
// 			tabSize: 4,
// 			insertSpaces: true,
// 			wordWrap: "on",
// 			folding: true,
// 			bracketPairColorization: {
// 				enabled: true,
// 			},
// 			suggest: {
// 				showKeywords: true,
// 				showSnippets: true,
// 			},
// 			quickSuggestions: {
// 				other: true,
// 				comments: false,
// 				strings: false,
// 			},
// 		});

// 		// Ctrl/Cmd+Enter to run query
// 		editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
// 			const query = editorInstance.getValue();
// 			console.log("Executing query:\n", query);
// 			alert(`Would execute:\n\n${query}`);
// 		});

// 		// Listen to editor content changes for auto-save
// 		const disposable = editorInstance.onDidChangeModelContent(() => {
// 			const value = editorInstance.getValue();
// 			console.log("editorInstance", value);
// 			debouncedSave(value);
// 		});

// 		setEditor(editorInstance);

// 		// Cleanup function
// 		return () => {
// 			disposable.dispose();
// 			// Clear pending save timeout
// 			if (saveTimeoutRef.current) {
// 				clearTimeout(saveTimeoutRef.current);
// 			}
// 			editorInstance.dispose();
// 		};
// 	}, [debouncedSave, getInitialQuery]);

// 	return (
// 		<div
// 			ref={monacoEl}
// 			className="flex-1 min-h-0"
// 		/>
// 	);
// };
