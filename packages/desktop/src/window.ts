import { BrowserWindow, shell } from "electron";

export const createWindow = (url: string): BrowserWindow => {
	const isApp = (target: string) => target.startsWith(`${new URL(url).origin}/`);
	const openOutside = (target: string) => {
		if (/^https?:/.test(target)) void shell.openExternal(target);
	};

	const window = new BrowserWindow({
		title: "db-studio",
		width: 1280,
		height: 820,
		minWidth: 900,
		minHeight: 600,
		show: false,
		backgroundColor: "#09090b",
		webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
	});
	window.once("ready-to-show", () => window.show());

	window.webContents.setWindowOpenHandler(({ url: target }) => {
		if (isApp(target)) return { action: "allow" };
		openOutside(target);
		return { action: "deny" };
	});
	window.webContents.on("will-navigate", (event, target) => {
		if (isApp(target)) return;
		event.preventDefault();
		openOutside(target);
	});

	void window.loadURL(url);
	return window;
};
