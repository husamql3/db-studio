import path from "node:path";
import { app } from "electron";

export const isDev = !app.isPackaged;
export const APP_SCHEME = "dbstudio";
export const APP_ORIGIN = `${APP_SCHEME}://app`;
export const APP_URL = `${APP_ORIGIN}/`;
export const devServerUrl = isDev ? process.env.VITE_DEV_SERVER_URL : undefined;

// In dev the bundle lives in packages/desktop/dist-electron and the server is a sibling
// workspace build. In production the staged server sits in resources/server.
export const serverDir = isDev
	? path.resolve(__dirname, "../../server/dist")
	: path.join(process.resourcesPath, "server");
export const serverEntry = path.join(serverDir, "index.js");
export const webDistDir = path.join(serverDir, "web-dist");
export const preloadPath = path.join(__dirname, "preload.cjs");
export const rendererUrl = devServerUrl ?? APP_URL;
/** Origin the server child must allow for CORS. */
export const rendererOrigin = devServerUrl ? new URL(devServerUrl).origin : APP_ORIGIN;
