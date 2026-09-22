import { cn } from "@db-studio/ui/utils";
import * as monaco from "monaco-editor";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/use-theme";
import {
	MONACO_DARK_THEME,
	MONACO_LIGHT_THEME,
	registerMonacoThemes,
} from "@/lib/monaco-theme";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

type JsonEditorProps = {
	value: string;
	onChange: (value: string) => void;
	onSave: () => void;
	onCancel: () => void;
	className?: string;
};

/**
 * Monaco-backed JSON editor with line numbers, used by the JSON cell popover.
 * Mounts once and syncs value/theme/preferences through effects so typing never
 * recreates the editor.
 */
export const JsonEditor = ({
	value,
	onChange,
	onSave,
	onCancel,
	className,
}: JsonEditorProps) => {
	const hostRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const handlersRef = useRef({ onChange, onSave, onCancel });
	handlersRef.current = { onChange, onSave, onCancel };

	const { isDark } = useTheme();
	const { editor: editorPreferences } = usePersonalPreferencesStore();

	useEffect(() => {
		if (!hostRef.current) return;
		registerMonacoThemes();

		const instance = monaco.editor.create(hostRef.current, {
			value,
			language: "json",
			theme: isDark ? MONACO_DARK_THEME : MONACO_LIGHT_THEME,
			fontSize: editorPreferences.fontSize,
			tabSize: editorPreferences.tabSize,
			wordWrap: editorPreferences.wordWrap ? "on" : "off",
			lineNumbers: "on",
			lineNumbersMinChars: 3,
			lineDecorationsWidth: 4,
			minimap: { enabled: false },
			overviewRulerLanes: 0,
			hideCursorInOverviewRuler: true,
			scrollBeyondLastLine: false,
			automaticLayout: true,
			insertSpaces: true,
			folding: true,
			renderLineHighlight: "none",
			bracketPairColorization: { enabled: true },
			padding: { top: 6, bottom: 6 },
			scrollbar: { horizontal: "hidden", vertical: "auto", useShadows: false },
		});
		editorRef.current = instance;

		const model = instance.getModel();
		if (model) {
			instance.setPosition(model.getFullModelRange().getEndPosition());
		}
		instance.focus();

		const disposables = [
			instance.onDidChangeModelContent(() =>
				handlersRef.current.onChange(instance.getValue()),
			),
			instance.onKeyDown((event) => {
				if (event.keyCode === monaco.KeyCode.Escape) {
					event.preventDefault();
					event.stopPropagation();
					handlersRef.current.onCancel();
				}
			}),
			instance.addAction({
				id: "db-studio.save-json-cell",
				label: "Save changes",
				keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
				run: () => handlersRef.current.onSave(),
			}),
		];

		return () => {
			for (const disposable of disposables) disposable.dispose();
			instance.dispose();
			editorRef.current = null;
		};
	}, []);

	useEffect(() => {
		monaco.editor.setTheme(isDark ? MONACO_DARK_THEME : MONACO_LIGHT_THEME);
	}, [isDark]);

	useEffect(() => {
		editorRef.current?.updateOptions({
			fontSize: editorPreferences.fontSize,
			wordWrap: editorPreferences.wordWrap ? "on" : "off",
		});
		editorRef.current?.getModel()?.updateOptions({ tabSize: editorPreferences.tabSize });
	}, [editorPreferences.fontSize, editorPreferences.wordWrap, editorPreferences.tabSize]);

	useEffect(() => {
		const instance = editorRef.current;
		if (instance && instance.getValue() !== value) {
			instance.setValue(value);
		}
	}, [value]);

	// The grid listens for arrow/enter keys on its cells; keep them inside the editor.
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => event.stopPropagation();

	return (
		<div
			ref={hostRef}
			onKeyDown={onKeyDown}
			className={cn("w-full", className)}
		/>
	);
};
