import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

export type Logger = {
	info: (scope: string, message: string) => void;
	warn: (scope: string, message: string) => void;
	error: (scope: string, message: string) => void;
	readonly file: string;
};

export const createLogger = (): Logger => {
	const dir = path.join(app.getPath("userData"), "logs");
	mkdirSync(dir, { recursive: true });
	const file = path.join(dir, "desktop.log");

	const write = (level: string, scope: string, message: string) => {
		const line = `${new Date().toISOString()} ${level} [${scope}] ${message}\n`;
		try {
			appendFileSync(file, line);
		} catch {}
		if (!app.isPackaged) process.stdout.write(line);
	};

	return {
		info: (scope, message) => write("INFO", scope, message),
		warn: (scope, message) => write("WARN", scope, message),
		error: (scope, message) => write("ERROR", scope, message),
		file,
	};
};
