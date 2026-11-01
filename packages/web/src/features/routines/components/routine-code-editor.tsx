import * as monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import { useTheme } from "@/hooks/use-theme";
import {
	MONACO_DARK_THEME,
	MONACO_LIGHT_THEME,
	registerMonacoThemes,
} from "@/lib/monaco-theme";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const RoutineCodeEditor = ({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const onChangeRef = useRef(onChange);
	const { isDark } = useTheme();
	const { editor: preferences } = usePersonalPreferencesStore();

	onChangeRef.current = onChange;

	useEffect(() => {
		if (!containerRef.current) return;
		registerMonacoThemes();
		const editor = monaco.editor.create(containerRef.current, {
			value,
			language: "sql",
			theme: isDark ? MONACO_DARK_THEME : MONACO_LIGHT_THEME,
			automaticLayout: true,
			fontFamily: "JetBrains Mono, monospace",
			fontSize: preferences.fontSize,
			lineNumbers: "on",
			minimap: { enabled: true },
			padding: { top: 16, bottom: 16 },
			scrollBeyondLastLine: false,
			tabSize: preferences.tabSize,
			wordWrap: preferences.wordWrap ? "on" : "off",
		});
		const changeSubscription = editor.onDidChangeModelContent(() => {
			onChangeRef.current(editor.getValue());
		});
		editorRef.current = editor;

		return () => {
			changeSubscription.dispose();
			editor.dispose();
			editorRef.current = null;
		};
	}, []);

	useEffect(() => {
		monaco.editor.setTheme(isDark ? MONACO_DARK_THEME : MONACO_LIGHT_THEME);
	}, [isDark]);

	useEffect(() => {
		const editor = editorRef.current;
		if (editor && editor.getValue() !== value) editor.setValue(value);
	}, [value]);

	useEffect(() => {
		editorRef.current?.updateOptions({
			fontSize: preferences.fontSize,
			wordWrap: preferences.wordWrap ? "on" : "off",
		});
		editorRef.current?.getModel()?.updateOptions({ tabSize: preferences.tabSize });
	}, [preferences.fontSize, preferences.tabSize, preferences.wordWrap]);

	return (
		<div
			ref={containerRef}
			className="size-full bg-muted/20"
		/>
	);
};
