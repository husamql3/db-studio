import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useOverlayStore } from "@/stores/overlay.store";

export type CommandPaletteMode = "all" | "tables";

/**
 * Open/close, search mode, and the global hotkey for the command palette.
 * Kept apart from the command list so adding or regrouping commands never
 * touches the dialog's own lifecycle.
 */
export const useCommandPaletteState = () => {
	const { openOverlay, closeOverlay, isOverlayOpen } = useOverlayStore();
	const [mode, setMode] = useState<CommandPaletteMode>("all");
	const [inputValue, setInputValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const open = isOverlayOpen("command-palette.root");

	const handleOpenChange = useCallback(
		(isOpen: boolean) => {
			if (isOpen) {
				openOverlay("command-palette.root");
				return;
			}
			closeOverlay("command-palette.root");
			// Reset state when the dialog closes
			setMode("all");
			setInputValue("");
		},
		[openOverlay, closeOverlay],
	);

	const handleAction = useCallback(
		(action: () => void) => {
			// Go through handleOpenChange so mode/input reset on every close,
			// including closes triggered here instead of by the dialog itself.
			handleOpenChange(false);
			action();
		},
		[handleOpenChange],
	);

	const switchToTablesMode = useCallback(() => {
		setMode("tables");
		setInputValue("");
		// Focus input after mode switch
		setTimeout(() => inputRef.current?.focus(), 0);
	}, []);

	const switchToAllMode = useCallback(() => {
		setMode("all");
		setInputValue("");
		setTimeout(() => inputRef.current?.focus(), 0);
	}, []);

	// Handle input changes - detect mode triggers
	const handleInputChange = useCallback(
		(value: string) => {
			// Detect ">" prefix to switch to tables mode, keeping anything typed
			// after it (fast typing and pastes arrive as a single value).
			if (mode === "all" && value.startsWith(">")) {
				switchToTablesMode();
				setInputValue(value.slice(1));
				return;
			}
			// Also detect "table " or "tables " as triggers
			if (
				mode === "all" &&
				(value.toLowerCase() === "table " || value.toLowerCase() === "tables ")
			) {
				switchToTablesMode();
				return;
			}
			setInputValue(value);
		},
		[mode, switchToTablesMode],
	);

	// Backspace on empty input goes back to "all" mode. Escape is left to the
	// dialog so it always closes the palette.
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Backspace" && inputValue === "" && mode === "tables") {
				e.preventDefault();
				switchToAllMode();
			}
		},
		[inputValue, mode, switchToAllMode],
	);

	// Global toggle. Enabled on form tags and content-editables so the palette
	// also opens while another editor is focused. Events from inside the Monaco
	// surface are ignored so its Ctrl/Cmd+K chord prefix keeps working; the
	// query editor binds Ctrl/Cmd+Enter, Ctrl/Cmd+Shift+F and Ctrl/Cmd+S, so
	// there is nothing else to collide with.
	useHotkeys(
		"ctrl+k, meta+k",
		(event) => {
			if ((event.target as HTMLElement | null)?.closest?.(".monaco-editor")) return;
			event.preventDefault();
			// Read live state so the toggle always runs through the reset path.
			handleOpenChange(!useOverlayStore.getState().isOverlayOpen("command-palette.root"));
		},
		{ enableOnFormTags: true, enableOnContentEditable: true },
	);

	return {
		open,
		mode,
		inputValue,
		inputRef,
		handleOpenChange,
		handleAction,
		handleInputChange,
		handleKeyDown,
		switchToAllMode,
		switchToTablesMode,
	};
};
