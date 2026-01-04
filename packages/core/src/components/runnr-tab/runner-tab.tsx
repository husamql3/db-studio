import {
	Command,
	Download,
	Heart,
	LucideCornerDownLeft,
	TextAlignStart,
} from "lucide-react";
import * as monaco from "monaco-editor";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	BUILTIN_FUNCTIONS,
	BUILTIN_TYPES,
	DATA_TYPES,
	FUNCTIONS,
	KEYWORDS,
	OPERATORS,
	SUGGESTIONS,
} from "@/utils/constants/runner-editor";

export const RunnerTab = () => {
	const [editorInstance, setEditor] =
		useState<monaco.editor.IStandaloneCodeEditor | null>(null);
	const monacoEl = useRef<HTMLDivElement>(null);

	// Helper function you can call anytime
	const getCurrentQuery = () => {
		return editorInstance?.getValue() ?? "";
	};

	console.log("editorInstance", editorInstance?.getValue());

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
			value: `SELECT 
    u.id,
    u.username,
    u.email,
    COUNT(o.id) as order_count,
    SUM(o.total) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= '2024-01-01'
GROUP BY u.id, u.username, u.email
ORDER BY total_spent DESC
LIMIT 10;`,
			language: "pgsql",
			theme: "vs-dark",
			fontSize: 14,
			minimap: { enabled: false },
			lineNumbers: "on",
			roundedSelection: true,
			scrollBeyondLastLine: false,
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

		// Add keyboard shortcuts
		// editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
		//   const value = editorInstance.getValue();
		//   console.log("Execute Query:", value);
		//   alert(`Query execution would happen here!\n\nQuery:\n${value}`);
		// });

		// editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
		//   editorInstance.trigger("", "editor.action.formatDocument", {});
		// });

		// Example: Ctrl+Enter to run
		editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
			const query = getCurrentQuery();
			console.log("Executing query:\n", query);
			// → here you would call your real execute function
			alert(`Would execute:\n\n${query}`);
		});

		setEditor(editorInstance);

		return () => {
			editorInstance.dispose();
		};
	}, []);

	const handleExecuteQuery = () => {
		const query = getCurrentQuery();
		if (!query.trim()) {
			alert("Query is empty!");
			return;
		}
		console.log("Execute query! Query:", query);
		// your real execution logic here
	};

	return (
		<div className="h-screen w-full flex flex-col bg-gray-900">
			<header className="max-h-8 overflow-hidden border-b border-zinc-800 w-full flex items-center bg-black sticky top-0 left-0 right-0 z-0">
				<Button
					type="button"
					variant="default"
					className="h-8! border-l-0 border-y-0 border-r border-black rounded-none bg-green-700 text-white hover:bg-green-800 gap-1"
					onClick={handleExecuteQuery}
					aria-label="Run the query"
				>
					Run
					<Command className="size-3" />
					<LucideCornerDownLeft className="size-3" />
				</Button>

				<Button
					type="button"
					variant="secondary"
					className="h-8! border-l-0 border-y-0 border-r border-black rounded-none"
					// onClick={() => openSheet("add-record")}
					aria-label="Format the query"
				>
					Format <TextAlignStart className="size-3" />
				</Button>

				<Button
					type="button"
					variant="secondary"
					className="h-8! border-l-0 border-y-0 border-r border-black rounded-none"
					// onClick={() => openSheet("add-record")}
					aria-label="Favorite the query"
				>
					Favorite <Heart className="size-3" />
				</Button>

				<Button
					type="button"
					variant="secondary"
					className="h-8! border-l-0 border-y-0 border-r border-black rounded-none"
					// onClick={() => openSheet("add-record")}
					aria-label="Export the query"
				>
					Export <Download className="size-3" />
				</Button>
			</header>

			<div
				ref={monacoEl}
				className="flex-1"
			/>
		</div>
	);
};
