import type {
	DesktopBridge,
	DesktopPlatform,
	DesktopServerStatus,
	SaveConnectionInputSchemaType,
} from "@db-studio/shared/types";
import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "./ipc-channels";

// The API base URL only changes across a full reload (main reloads the window after
// connect/disconnect), so reading it once per page load is correct and avoids sync IPC.
const apiBaseUrl = ipcRenderer.sendSync(IPC.getApiBaseUrl) as string | null;
const version = ipcRenderer.sendSync(IPC.getVersion) as string;

const bridge: DesktopBridge = {
	platform: process.platform as DesktopPlatform,
	version,
	getApiBaseUrl: () => apiBaseUrl,
	getServerStatus: () => ipcRenderer.invoke(IPC.getServerStatus),
	onServerStatus: (listener) => {
		const handler = (_event: unknown, status: DesktopServerStatus) => listener(status);
		ipcRenderer.on(IPC.serverStatusChanged, handler);
		return () => {
			ipcRenderer.off(IPC.serverStatusChanged, handler);
		};
	},
	listConnections: () => ipcRenderer.invoke(IPC.listConnections),
	saveConnection: (input: SaveConnectionInputSchemaType) =>
		ipcRenderer.invoke(IPC.saveConnection, input),
	deleteConnection: (id) => ipcRenderer.invoke(IPC.deleteConnection, id),
	connect: (id) => ipcRenderer.invoke(IPC.connect, id),
	disconnect: () => ipcRenderer.invoke(IPC.disconnect),
	importEnvFile: () => ipcRenderer.invoke(IPC.importEnvFile),
	openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
};

contextBridge.exposeInMainWorld("desktop", bridge);
