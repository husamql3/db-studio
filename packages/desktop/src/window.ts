import { BrowserWindow, shell } from "electron";
import type { ConnectionStore } from "./connections/store";
import { APP_ORIGIN, devServerUrl, preloadPath, rendererUrl } from "./env";

const isRendererUrl = (url: string): boolean =>
	url.startsWith(APP_ORIGIN) || (devServerUrl !== undefined && url.startsWith(devServerUrl));

export const createMainWindow = (store: ConnectionStore): BrowserWindow => {
	const bounds = store.getWindowBounds();
	const window = new BrowserWindow({
		title: "db-studio",
		width: bounds?.width ?? 1280,
		height: bounds?.height ?? 820,
		x: bounds?.x,
		y: bounds?.y,
		minWidth: 900,
		minHeight: 600,
		show: false,
		backgroundColor: "#09090b",
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
		// Centered in the renderer's 38px title strip (see packages/web DesktopTitleBar).
		trafficLightPosition: { x: 14, y: 13 },
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
		},
	});

	window.once("ready-to-show", () => window.show());

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	const saveBounds = () => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			if (!window.isDestroyed() && !window.isMaximized()) {
				store.setWindowBounds(window.getBounds());
			}
		}, 300);
	};
	window.on("resize", saveBounds);
	window.on("move", saveBounds);

	// Anything that isn't our renderer opens in the system browser.
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:/.test(url)) void shell.openExternal(url);
		return { action: "deny" };
	});
	window.webContents.on("will-navigate", (event, url) => {
		if (isRendererUrl(url)) return;
		event.preventDefault();
		if (/^https?:/.test(url)) void shell.openExternal(url);
	});

	void window.loadURL(rendererUrl);
	return window;
};

/** Full reload so the renderer picks up the new (or cleared) API base URL. */
export const reloadRenderer = (window: BrowserWindow): void => {
	if (!window.isDestroyed()) void window.loadURL(rendererUrl);
};
