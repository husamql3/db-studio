import { statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import { APP_SCHEME, webDistDir } from "./env";
import { resolveStaticFile } from "./static-files";

/** Must run before `app.whenReady()`. */
export const registerAppScheme = (): void => {
	protocol.registerSchemesAsPrivileged([
		{
			scheme: APP_SCHEME,
			privileges: {
				standard: true,
				secure: true,
				supportFetchAPI: true,
				corsEnabled: true,
				stream: true,
			},
		},
	]);
};

const isFile = (filePath: string): boolean => {
	try {
		return statSync(filePath).isFile();
	} catch {
		return false;
	}
};

/** Serves the web build from disk at dbstudio://app/ with SPA fallback. */
export const handleAppProtocol = (): void => {
	protocol.handle(APP_SCHEME, (request) => {
		const { pathname } = new URL(request.url);
		const file = resolveStaticFile(webDistDir, pathname, isFile);
		return net.fetch(pathToFileURL(file).toString());
	});
};
