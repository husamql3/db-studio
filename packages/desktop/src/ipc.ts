import { readFile } from "node:fs/promises";
import type { SaveConnectionInputSchemaType } from "@db-studio/shared/types";
import { app, type BrowserWindow, dialog, ipcMain, shell } from "electron";
import { parseEnvCandidates } from "./connections/env-import";
import type { ConnectionStore } from "./connections/store";
import { IPC } from "./ipc-channels";
import type { ServerProcess } from "./server/server-process";
import { reloadRenderer } from "./window";

// Give the renderer's toast a moment before the page is torn down by the reload.
const RELOAD_DELAY_MS = 600;

export const registerIpc = ({
	store,
	server,
	getWindow,
}: {
	store: ConnectionStore;
	server: ServerProcess;
	getWindow: () => BrowserWindow | undefined;
}): void => {
	ipcMain.on(IPC.getVersion, (event) => {
		event.returnValue = app.getVersion();
	});
	ipcMain.on(IPC.getApiBaseUrl, (event) => {
		event.returnValue = server.apiBaseUrl;
	});
	ipcMain.handle(IPC.getServerStatus, () => server.status);

	let previousState = server.status.state;
	server.on("status", (status) => {
		const window = getWindow();
		window?.webContents.send(IPC.serverStatusChanged, status);
		// running -> error only happens when the child crashes. The page still points at the dead
		// API, so reload it; with no API base URL it falls back to the connection manager.
		if (window && previousState === "running" && status.state === "error") {
			reloadRenderer(window);
		}
		previousState = status.state;
	});

	ipcMain.handle(IPC.listConnections, () => store.list());
	ipcMain.handle(IPC.saveConnection, (_event, input: SaveConnectionInputSchemaType) =>
		store.save(input),
	);
	ipcMain.handle(IPC.deleteConnection, (_event, id: string) => store.delete(id));

	ipcMain.handle(IPC.connect, async (_event, id: string) => {
		const url = store.getUrl(id);
		if (!url) throw new Error("Connection not found");
		const status = await server.start(id, url);
		if (status.state === "running") {
			store.touch(id);
			const window = getWindow();
			if (window) setTimeout(() => reloadRenderer(window), RELOAD_DELAY_MS);
		}
		return status;
	});

	ipcMain.handle(IPC.disconnect, async () => {
		await server.stop();
		const window = getWindow();
		if (window) setTimeout(() => reloadRenderer(window), RELOAD_DELAY_MS);
	});

	ipcMain.handle(IPC.importEnvFile, async () => {
		const window = getWindow();
		const options: Electron.OpenDialogOptions = {
			title: "Import connections from .env",
			properties: ["openFile", "showHiddenFiles"],
			filters: [
				{ name: "Env files", extensions: ["env", "local", "example"] },
				{ name: "All files", extensions: ["*"] },
			],
		};
		const result = window
			? await dialog.showOpenDialog(window, options)
			: await dialog.showOpenDialog(options);
		const [file] = result.filePaths;
		if (result.canceled || !file) return [];
		return parseEnvCandidates(await readFile(file, "utf8"));
	});

	ipcMain.handle(IPC.openExternal, async (_event, url: string) => {
		if (!/^https?:\/\//.test(url)) throw new Error("Only http(s) links can be opened");
		await shell.openExternal(url);
	});
};
