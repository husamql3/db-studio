import * as monaco from "monaco-editor";

export const MONACO_DARK_THEME = "db-studio-dark";
export const MONACO_LIGHT_THEME = "db-studio-light";

let registered = false;

/**
 * Monaco ships opaque backgrounds that don't match our surfaces, so both editors
 * use these transparent variants and inherit the container background instead.
 */
export const registerMonacoThemes = () => {
	if (registered) return;
	registered = true;

	const transparentColors = {
		"editor.background": "#00000000",
		"editorGutter.background": "#00000000",
		"editor.lineHighlightBackground": "#00000000",
		"editorOverviewRuler.background": "#00000000",
	};

	monaco.editor.defineTheme(MONACO_DARK_THEME, {
		base: "vs-dark",
		inherit: true,
		rules: [],
		colors: transparentColors,
	});
	monaco.editor.defineTheme(MONACO_LIGHT_THEME, {
		base: "vs",
		inherit: true,
		rules: [],
		colors: transparentColors,
	});
};
