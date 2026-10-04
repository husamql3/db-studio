import { app, BrowserWindow } from "electron";
import { ConnectionStore } from "./connections/store";
import { devServerUrl, isDev } from "./env";
import { registerIpc } from "./ipc";
import { createLogger } from "./log";
import { handleAppProtocol, registerAppScheme } from "./protocol";
import { ServerProcess } from "./server/server-process";
import { setupAutoUpdater } from "./updater";
import { createMainWindow } from "./window";

// In dev Electron derives userData from package.json `name`; pin it so saved connections
// live in the same place as the packaged app (productName).
app.setName("db-studio");
registerAppScheme();

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	let mainWindow: BrowserWindow | undefined;
	let server: ServerProcess | undefined;

	app.whenReady().then(() => {
		const log = createLogger();
		log.info("app", `db-studio ${app.getVersion()} starting (dev=${isDev})`);
		if (isDev && !devServerUrl) {
			log.warn("app", "VITE_DEV_SERVER_URL is not set; loading the built web bundle instead");
		}

		const store = new ConnectionStore();
		server = new ServerProcess(log);
		handleAppProtocol();
		registerIpc({ store, server, getWindow: () => mainWindow });

		const openWindow = () => {
			const window = createMainWindow(store);
			window.on("closed", () => {
				if (mainWindow === window) mainWindow = undefined;
			});
			mainWindow = window;
		};
		openWindow();

		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) openWindow();
		});
		app.on("second-instance", () => {
			if (!mainWindow) return openWindow();
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		});

		setupAutoUpdater(log);
	});

	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") app.quit();
	});

	app.on("before-quit", () => {
		server?.killSync();
	});
}
