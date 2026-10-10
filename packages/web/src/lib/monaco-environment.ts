import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";

/**
 * Monaco locates its editor worker with `new URL(file, import.meta.url)`. The
 * file is small enough for Vite to inline as a `data:` URL, where its relative
 * imports cannot resolve, so the worker dies on load. Hand Monaco bundled workers.
 */
self.MonacoEnvironment = {
	getWorker: (_workerId, label) => (label === "json" ? new JsonWorker() : new EditorWorker()),
};
