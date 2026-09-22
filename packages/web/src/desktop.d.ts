import type { DesktopBridge } from "@db-studio/shared/types";

declare global {
	interface Window {
		/** Present only inside the Electron desktop app (injected by the preload script). */
		desktop?: DesktopBridge;
	}
}
