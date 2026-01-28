import * as monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
	BUILTIN_FUNCTIONS,
	BUILTIN_TYPES,
	DATA_TYPES,
	FUNCTIONS,
	KEYWORDS,
	OPERATORS,
	SUGGESTIONS,
} from "@/utils/constants/runner-editor";

interface CodeEditorProps {
	initialQuery: string;
	queryId?: string;
	savedQuery: string;
	onQueryChange: (query: string) => void;
	onUnsavedChanges: (hasChanges: boolean) => void;
	onExecuteQuery: (query: string) => void;
	onFormatQuery: () => void;
	onSaveQuery: () => void;
}

export const CodeEditor = ({
	initialQuery,
	queryId,
	savedQuery,
	onQueryChange,
	onUnsavedChanges,
	onExecuteQuery,
	onSaveQuery,
}: CodeEditorProps) => {
	const monacoEl = useRef<HTMLDivElement>(null);
	const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

	useEffect(() => {
		if (!monacoEl.current) return;

		// Register PostgreSQL language
		monaco.languages.register({ id: "pgsql" });

		// Register document formatting provider for pgsql
		monaco.languages.registerDocumentFormattingEditProvider("pgsql", {
			provideDocumentFormattingEdits: (model) => {
				const text = model.getValue();
				// Basic SQL formatting with proper indentation
				const formatted = text
					.replace(/\s+/g, " ") // normalize whitespace
					.replace(/\s*,\s*/g, ",\n\t") // commas on new lines with tab
					.replace(
						/\b(SELECT|FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET)\b/gi,
						"\n$1",
					)
					.replace(/\b(AND|OR)\b/gi, "\n\t$1")
					.trim()
					.split("\n")
					.map((line) => {
						const trimmed = line.trim();
						// Add tab indentation for continued clauses and logical operators
						if (
							trimmed.startsWith("AND") ||
							trimmed.startsWith("OR") ||
							/^[^A-Z]/.test(trimmed)
						) {
							return `\t${trimmed}`;
						}
						return trimmed;
					})
					.join("\n");

				return [
					{
						range: model.getFullModelRange(),
						text: formatted,
					},
				];
			},
		});

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
				complexIdentifiers: [[/"/, { token: "identifier.quote", next: "@quotedIdentifier" }]],
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
					...SUGGESTIONS.map((kw) => ({
						label: kw,
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: kw,
						range,
					})),
					...FUNCTIONS.map((fn) => ({
						label: fn,
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: fn.includes("(*)") ? fn : fn.replace("()", "($0)"),
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range,
					})),
					...DATA_TYPES.map((type) => ({
						label: type,
						kind: monaco.languages.CompletionItemKind.TypeParameter,
						insertText: type,
						range,
					})),
					{
						label: "select-template",
						kind: monaco.languages.CompletionItemKind.Snippet,
						insertText: [
							"SELECT ${1:columns}",
							"FROM ${2:table}",
							"WHERE ${3:condition};",
						].join("\n"),
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
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
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
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
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						documentation: "INSERT statement template",
						range,
					},
				];

				return { suggestions };
			},
		});

		// Create editor instance
		const editorInstance = monaco.editor.create(monacoEl.current, {
			value: initialQuery,
			language: "pgsql",
			theme: "vs-dark",
			fontSize: 14,
			minimap: { enabled: false },
			lineNumbers: "on",
			roundedSelection: true,
			scrollBeyondLastLine: true,
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

		editorRef.current = editorInstance;

		// Keyboard shortcuts
		// Ctrl/Cmd+Enter to run query
		editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
			const query = editorInstance.getValue();
			if (!query.trim()) {
				toast.error("Query is empty!");
				return;
			}
			onExecuteQuery(query);
		});

		// Ctrl/Cmd+Shift+F to format query
		editorInstance.addCommand(
			monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
			() => {
				editorInstance.trigger("keyboard", "editor.action.formatDocument", {});
				toast.success("Query formatted");
			},
		);

		// Ctrl/Cmd+S to save query
		editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
			onSaveQuery();
		});

		// Set initial query change
		onQueryChange(editorInstance.getValue());

		// Reset unsaved changes state when editor is initialized
		if (queryId) {
			const initialValue = editorInstance.getValue();
			onUnsavedChanges(initialValue !== savedQuery);
		} else {
			onUnsavedChanges(false);
		}

		// Listen to editor changes to detect unsaved changes
		const disposable = editorInstance.onDidChangeModelContent(() => {
			const currentValue = editorInstance.getValue();
			onQueryChange(currentValue);

			if (!queryId) {
				onUnsavedChanges(false);
				return;
			}
			onUnsavedChanges(currentValue !== savedQuery);
		});

		// Cleanup function
		return () => {
			disposable.dispose();
			editorInstance.dispose();
		};
	}, [initialQuery, queryId, savedQuery, onQueryChange, onUnsavedChanges, onExecuteQuery]);

	return (
		<div
			ref={monacoEl}
			className="flex-1 min-h-0 overflow-y-scroll"
		/>
	);
};
