import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import type { Logger } from "./log";

/**
 * GitHub Releases auto-update. Unsigned macOS builds cannot install updates (Squirrel.Mac
 * refuses them), so on those the check logs and no-ops; Windows works as-is.
 */
export const setupAutoUpdater = (log: Logger): void => {
	if (!app.isPackaged) return;
	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.logger = {
		info: (message: unknown) => log.info("updater", String(message)),
		warn: (message: unknown) => log.warn("updater", String(message)),
		error: (message: unknown) => log.error("updater", String(message)),
		debug: () => {},
	};

	autoUpdater.on("update-downloaded", async (info) => {
		const { response } = await dialog.showMessageBox({
			type: "info",
			buttons: ["Restart now", "Later"],
			defaultId: 0,
			cancelId: 1,
			message: `db-studio ${info.version} is ready to install`,
			detail: "Restart to apply the update. It will otherwise install when you quit.",
		});
		if (response === 0) autoUpdater.quitAndInstall();
	});

	autoUpdater.checkForUpdates().catch((error: unknown) => {
		log.warn("updater", error instanceof Error ? error.message : String(error));
	});
};
