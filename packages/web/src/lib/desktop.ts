export const desktop = typeof window !== "undefined" ? window.desktop : undefined;
export const isDesktop = desktop !== undefined;
/** True inside the desktop app while no server child is running. */
export const isDesktopDisconnected = () => desktop !== undefined && !desktop.getApiBaseUrl();

/**
 * macOS desktop windows hide the native title bar (`hiddenInset`), so the app renders its own
 * drag strip that clears the traffic lights. Windows keeps the native title bar.
 */
export const showsDesktopTitleBar = desktop?.platform === "darwin";
export const DESKTOP_TITLE_BAR_HEIGHT = 38;

if (showsDesktopTitleBar && typeof document !== "undefined") {
	// Lets global CSS (index.css) push fixed-position sheets below the title bar.
	document.documentElement.classList.add("desktop-title-bar");
	document.documentElement.style.setProperty(
		"--desktop-title-bar-height",
		`${DESKTOP_TITLE_BAR_HEIGHT}px`,
	);
}
