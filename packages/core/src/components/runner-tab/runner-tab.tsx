import * as monaco from "monaco-editor";
import { useEffect, useRef, useState } from "react";

export const RunnerTab = () => {
	const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
	const monacoEl = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// Set up language configuration for 'pgsql'
		monaco.languages.setLanguageConfiguration("pgsql", {
			comments: {
				lineComment: "--",
				blockComment: ["/*", "*/"],
			},
			brackets: [
				["[", "]"],
				["(", ")"],
			],
			colorizedBracketPairs: [
				["[", "]"],
				["(", ")"],
			],
			autoClosingPairs: [
				{ open: "[", close: "]" },
				{ open: "(", close: ")" },
				{ open: '"', close: '"', notIn: ["string"] },
				{ open: "'", close: "'", notIn: ["string", "comment"] },
			],
			surroundingPairs: [
				{ open: "[", close: "]" },
				{ open: "(", close: ")" },
				{ open: '"', close: '"' },
				{ open: "'", close: "'" },
			],
			autoCloseBefore: ";:.,=}])> \n\t",
			folding: {
				markers: {
					start: /\bBEGIN\b/i,
					end: /\bEND\b/i,
				},
			},
			indentationRules: {
				increaseIndentPattern: /\b(BEGIN|CASE|ELSE|ELSIF|IF|LOOP|THEN|WHEN)\b/i,
				decreaseIndentPattern: /\b(END)\b/i,
			},
			onEnterRules: [
				{
					beforeText: /^\s*(?:--.*)?$/i,
					action: { indentAction: monaco.languages.IndentAction.None },
				},
				{
					beforeText: /\b(BEGIN|CASE|IF|LOOP)\b/i,
					action: { indentAction: monaco.languages.IndentAction.Indent },
				},
			],
			wordPattern: /([a-zA-Z_][\w$]*)/g,
		});

		// Register completion provider for SQL suggestions
		const completionProvider = monaco.languages.registerCompletionItemProvider("pgsql", {
			provideCompletionItems: (model, position) => {
				const word = model.getWordUntilPosition(position);
				const range = {
					startLineNumber: position.lineNumber,
					endLineNumber: position.lineNumber,
					startColumn: word.startColumn,
					endColumn: word.endColumn,
				};

				const suggestions: monaco.languages.CompletionItem[] = [
					// SQL Keywords
					{
						label: "SELECT",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "SELECT ",
						range: range,
						detail: "SQL SELECT statement",
						documentation: "Query data from database tables",
					},
					{
						label: "FROM",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "FROM ",
						range: range,
						detail: "SQL FROM clause",
					},
					{
						label: "WHERE",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "WHERE ",
						range: range,
						detail: "SQL WHERE clause",
					},
					{
						label: "JOIN",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "JOIN ",
						range: range,
						detail: "SQL JOIN clause",
					},
					{
						label: "INNER JOIN",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "INNER JOIN ",
						range: range,
						detail: "SQL INNER JOIN",
					},
					{
						label: "LEFT JOIN",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "LEFT JOIN ",
						range: range,
						detail: "SQL LEFT JOIN",
					},
					{
						label: "ORDER BY",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "ORDER BY ",
						range: range,
						detail: "SQL ORDER BY clause",
					},
					{
						label: "GROUP BY",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "GROUP BY ",
						range: range,
						detail: "SQL GROUP BY clause",
					},
					{
						label: "HAVING",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "HAVING ",
						range: range,
						detail: "SQL HAVING clause",
					},
					{
						label: "LIMIT",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "LIMIT ",
						range: range,
						detail: "SQL LIMIT clause",
					},
					{
						label: "OFFSET",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "OFFSET ",
						range: range,
						detail: "SQL OFFSET clause",
					},
					{
						label: "INSERT INTO",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "INSERT INTO ",
						range: range,
						detail: "SQL INSERT statement",
					},
					{
						label: "UPDATE",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "UPDATE ",
						range: range,
						detail: "SQL UPDATE statement",
					},
					{
						label: "DELETE FROM",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "DELETE FROM ",
						range: range,
						detail: "SQL DELETE statement",
					},
					{
						label: "CREATE TABLE",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "CREATE TABLE ",
						range: range,
						detail: "SQL CREATE TABLE statement",
					},
					{
						label: "DROP TABLE",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "DROP TABLE ",
						range: range,
						detail: "SQL DROP TABLE statement",
					},
					{
						label: "ALTER TABLE",
						kind: monaco.languages.CompletionItemKind.Keyword,
						insertText: "ALTER TABLE ",
						range: range,
						detail: "SQL ALTER TABLE statement",
					},

					// SQL Functions
					{
						label: "COUNT",
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: "COUNT(${1:*})",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "COUNT aggregate function",
						documentation: "Returns the number of rows",
					},
					{
						label: "SUM",
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: "SUM(${1:column})",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "SUM aggregate function",
					},
					{
						label: "AVG",
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: "AVG(${1:column})",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "AVG aggregate function",
					},
					{
						label: "MAX",
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: "MAX(${1:column})",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "MAX aggregate function",
					},
					{
						label: "MIN",
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: "MIN(${1:column})",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "MIN aggregate function",
					},
					{
						label: "UPPER",
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: "UPPER(${1:column})",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "Convert to uppercase",
					},
					{
						label: "LOWER",
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: "LOWER(${1:column})",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "Convert to lowercase",
					},
					{
						label: "CONCAT",
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: "CONCAT(${1:column1}, ${2:column2})",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "Concatenate strings",
					},
					{
						label: "COALESCE",
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: "COALESCE(${1:column}, ${2:default})",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "Return first non-null value",
					},
					{
						label: "NOW",
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: "NOW()",
						range: range,
						detail: "Current timestamp",
					},
					{
						label: "CURRENT_DATE",
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: "CURRENT_DATE",
						range: range,
						detail: "Current date",
					},

					// Data Types
					{
						label: "INTEGER",
						kind: monaco.languages.CompletionItemKind.TypeParameter,
						insertText: "INTEGER",
						range: range,
						detail: "Integer data type",
					},
					{
						label: "VARCHAR",
						kind: monaco.languages.CompletionItemKind.TypeParameter,
						insertText: "VARCHAR(${1:255})",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "Variable character data type",
					},
					{
						label: "TEXT",
						kind: monaco.languages.CompletionItemKind.TypeParameter,
						insertText: "TEXT",
						range: range,
						detail: "Text data type",
					},
					{
						label: "BOOLEAN",
						kind: monaco.languages.CompletionItemKind.TypeParameter,
						insertText: "BOOLEAN",
						range: range,
						detail: "Boolean data type",
					},
					{
						label: "TIMESTAMP",
						kind: monaco.languages.CompletionItemKind.TypeParameter,
						insertText: "TIMESTAMP",
						range: range,
						detail: "Timestamp data type",
					},
					{
						label: "DATE",
						kind: monaco.languages.CompletionItemKind.TypeParameter,
						insertText: "DATE",
						range: range,
						detail: "Date data type",
					},
					{
						label: "JSONB",
						kind: monaco.languages.CompletionItemKind.TypeParameter,
						insertText: "JSONB",
						range: range,
						detail: "Binary JSON data type",
					},

					// Snippets
					{
						label: "select-all",
						kind: monaco.languages.CompletionItemKind.Snippet,
						insertText: "SELECT * FROM ${1:table_name};",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "SELECT all columns",
						documentation: "Select all columns from a table",
					},
					{
						label: "select-where",
						kind: monaco.languages.CompletionItemKind.Snippet,
						insertText:
							"SELECT ${1:columns}\nFROM ${2:table_name}\nWHERE ${3:condition};",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "SELECT with WHERE",
						documentation: "Select with condition",
					},
					{
						label: "insert-values",
						kind: monaco.languages.CompletionItemKind.Snippet,
						insertText:
							"INSERT INTO ${1:table_name} (${2:columns})\nVALUES (${3:values});",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "INSERT with values",
						documentation: "Insert new row",
					},
					{
						label: "update-set",
						kind: monaco.languages.CompletionItemKind.Snippet,
						insertText:
							"UPDATE ${1:table_name}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "UPDATE with SET",
						documentation: "Update existing rows",
					},
					{
						label: "create-table",
						kind: monaco.languages.CompletionItemKind.Snippet,
						insertText:
							"CREATE TABLE ${1:table_name} (\n  ${2:id} SERIAL PRIMARY KEY,\n  ${3:column_name} ${4:data_type}\n);",
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						range: range,
						detail: "CREATE TABLE template",
						documentation: "Create new table",
					},
				];

				return { suggestions };
			},
		});

		if (monacoEl.current && !editor) {
			const newEditor = monaco.editor.create(monacoEl.current, {
				value: [
					"SELECT * FROM users;",
					"WHERE age > 18;",
					"ORDER BY name DESC;",
					"LIMIT 10;",
				].join("\n"),
				language: "pgsql",
				theme: "vs-dark",

				// Layout & Display
				automaticLayout: true,
				minimap: { enabled: false },
				fontSize: 14,
				lineHeight: 20,
				fontFamily:
					"'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
				fontLigatures: true,

				// Scrolling & Navigation
				// scrollBeyondLastLine: false,
				smoothScrolling: true,
				mouseWheelZoom: true,
				cursorBlinking: "smooth",
				cursorSmoothCaretAnimation: "on",

				// Editor Behavior
				wordWrap: "off",
				wrappingIndent: "indent",
				formatOnPaste: true,
				formatOnType: true,
				autoClosingBrackets: "always",
				autoClosingQuotes: "always",
				autoIndent: "full",
				tabSize: 2,
				insertSpaces: true,

				// Selection & Multi-cursor
				multiCursorModifier: "ctrlCmd",
				selectionHighlight: true,
				occurrencesHighlight: "multiFile",

				// Suggestions & IntelliSense - ENHANCED
				suggest: {
					showKeywords: true,
					showSnippets: true,
					showFunctions: true,
					showWords: true,
					showVariables: true,
					showConstants: true,
					showEnums: true,
					showClasses: true,
					showInterfaces: true,
					showModules: true,
					showProperties: true,
					showFields: true,
					showValues: true,
					showOperators: true,
					preview: true,
					previewMode: "subwordSmart",
					insertMode: "insert",
					filterGraceful: true,
					snippetsPreventQuickSuggestions: false,
					localityBonus: true,
					shareSuggestSelections: true,
					showIcons: true,
					showStatusBar: true,
				},
				suggestOnTriggerCharacters: true,
				acceptSuggestionOnCommitCharacter: true,
				acceptSuggestionOnEnter: "on",
				quickSuggestions: {
					other: "on",
					comments: false,
					strings: true,
				},
				quickSuggestionsDelay: 100,
				suggestSelection: "first",
				wordBasedSuggestions: "matchingDocuments",
				tabCompletion: "on",

				// Parameter hints
				parameterHints: {
					enabled: true,
					cycle: true,
				},

				// Code Features
				folding: true,
				foldingStrategy: "indentation",
				showFoldingControls: "mouseover",
				matchBrackets: "always",
				bracketPairColorization: { enabled: true },
				guides: {
					bracketPairs: true,
					indentation: true,
				},

				// Line Numbers & Gutter
				lineNumbers: "on",
				lineNumbersMinChars: 3,
				glyphMargin: false,

				// Scrollbars
				scrollbar: {
					vertical: "auto",
					horizontal: "auto",
					useShadows: false,
					verticalScrollbarSize: 10,
					horizontalScrollbarSize: 10,
				},

				// Performance
				renderWhitespace: "selection",
				renderControlCharacters: false,
				renderLineHighlight: "all",
				renderLineHighlightOnlyWhenFocus: false,

				// Find & Replace
				find: {
					seedSearchStringFromSelection: "selection",
					autoFindInSelection: "never",
					addExtraSpaceOnTop: false,
				},

				// Accessibility
				accessibilitySupport: "auto",
				tabFocusMode: false,
			});

			// Add keyboard shortcuts for enhanced navigation
			newEditor.addCommand(monaco.KeyCode.F5, () => {
				console.log("Execute query - F5 pressed");
			});

			newEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
				console.log("Execute query - Ctrl/Cmd+Enter pressed");
			});

			// Trigger suggestions automatically with Ctrl+Space
			newEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
				newEditor.trigger("keyboard", "editor.action.triggerSuggest", {});
			});

			// Focus the editor immediately
			newEditor.focus();

			setEditor(newEditor);
		}

		return () => {
			completionProvider.dispose();
			if (editor) {
				editor.dispose();
			}
		};
	}, []);

	// Handle container clicks to focus editor
	const handleContainerClick = () => {
		if (editor) {
			editor.focus();
		}
	};

	return (
		<div
			ref={monacoEl}
			onClick={handleContainerClick}
			className="w-full h-full outline-none"
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
			}}
		/>
	);
};
