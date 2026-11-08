import { app, BrowserWindow, dialog } from "electron";
import { createLogger } from "./log";
import { startServer } from "./server";
import { setupAutoUpdater } from "./updater";
import { createWindow } from "./window";

// In dev Electron derives userData from package.json `name`; pin it to the packaged productName.
app.setName("db-studio");

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	let url: string | undefined;
	let window: BrowserWindow | undefined;
	let quitting = false;

	const openWindow = () => {
		if (!url) return;
		const opened = createWindow(url);
		opened.on("closed", () => {
			if (window === opened) window = undefined;
		});
		window = opened;
	};

	app.whenReady().then(async () => {
		const log = createLogger();
		log.info("app", `db-studio ${app.getVersion()} starting`);
		const fail = (message: string) => {
			if (quitting) return;
			log.error("app", message);
			dialog.showErrorBox("db-studio server failed", `${message}\n\nLog file: ${log.file}`);
			app.quit();
		};

		try {
			const server = await startServer(log);
			server.child.once("exit", (code) =>
				fail([`The server stopped unexpectedly (code ${code}).`, ...server.output].join("\n")),
			);
			url = server.url;
			openWindow();
		} catch (error) {
			fail(error instanceof Error ? error.message : String(error));
		}

		setupAutoUpdater(log);
	});

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) openWindow();
	});
	app.on("second-instance", () => {
		if (!window) return openWindow();
		if (window.isMinimized()) window.restore();
		window.focus();
	});
	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") app.quit();
	});
	// The child itself is killed by the before-quit listener in server.ts.
	app.on("before-quit", () => {
		quitting = true;
	});
}
