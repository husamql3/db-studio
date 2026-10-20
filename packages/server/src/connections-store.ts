import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
	connectionColorSchema,
	type UpdateConnectionSchemaType,
} from "@db-studio/shared/types";
import { z } from "zod";
import { HTTPException } from "@/http-exception.js";

/**
 * Saved connections live in `~/.dbstudio/connections.json` (`DB_STUDIO_CONFIG_DIR` overrides the
 * directory). The file holds passwords, so it is written owner-only and its URLs never leave
 * the server: the browser gets `maskConnectionUrl` output and refers to entries by id.
 */
const savedConnectionSchema = z.object({
	id: z.string(),
	name: z.string(),
	url: z.string(),
	color: connectionColorSchema.nullable(),
	lastUsedAt: z.number(),
});
export type SavedConnection = z.infer<typeof savedConnectionSchema>;

const fileSchema = z.object({
	version: z.literal(1),
	connections: z.array(savedConnectionSchema),
});

const configDir = () => process.env.DB_STUDIO_CONFIG_DIR ?? join(homedir(), ".dbstudio");
const connectionsFile = () => join(configDir(), "connections.json");

const SECRET = "••••";
const FILE_URL = /^(sqlite|duckdb):\/\/(.*)$/;

const SECRET_PARAMS = new Set(["authtoken", "password", "token"]);

/** A query parameter name as the driver reads it: `%61uthToken` is `authToken`. */
const decodeParamName = (name: string) => {
	try {
		return decodeURIComponent(name.replaceAll("+", " ")).toLowerCase();
	} catch {
		return name.toLowerCase();
	}
};

/** Replaces the password and any auth token or password query parameter with `••••`. */
export const maskConnectionUrl = (url: string): string =>
	url
		// The last `@` of the authority ends the password: drivers read `u:p@ss@host` as `p@ss`.
		.replace(/^([a-z][a-z0-9+.-]*:\/\/[^:/@?#]*:)[^/?#]*@/i, `$1${SECRET}@`)
		.replace(/([?&])([^=&#]*)=[^&#]*/g, (param, separator: string, name: string) =>
			SECRET_PARAMS.has(decodeParamName(name)) ? `${separator}${name}=${SECRET}` : param,
		);

/** Trims the URL and makes a relative SQLite or DuckDB path absolute against `cwd`. */
export const normalizeConnectionUrl = (url: string, cwd = process.cwd()): string => {
	const trimmed = url.trim();
	const file = trimmed.match(FILE_URL);
	if (!file) return trimmed;
	const [, scheme, path = ""] = file;
	if (path === ":memory:" || path.startsWith("/")) return trimmed;
	return `${scheme}://${resolve(cwd, path)}`;
};

/** `host/database` for a server, the file name for a file. */
export const defaultConnectionName = (url: string): string => {
	const file = url.match(FILE_URL);
	if (file) return basename(file[2] ?? "") || url;
	try {
		const parsed = new URL(url);
		const database = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ""));
		return database ? `${parsed.hostname}/${database}` : parsed.hostname;
	} catch {
		return maskConnectionUrl(url);
	}
};

/** Two URLs name the same saved connection when they differ only in their secrets. */
const identity = (url: string) => maskConnectionUrl(url);

const readAll = async (): Promise<SavedConnection[]> => {
	let raw: string;
	try {
		raw = await readFile(connectionsFile(), "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const parsed = fileSchema.safeParse(JSON.parse(raw));
	if (!parsed.success) throw new Error(`${connectionsFile()} is not a valid connections file`);
	return parsed.data.connections;
};

const writeAll = async (connections: SavedConnection[]) => {
	const dir = configDir();
	await mkdir(dir, { recursive: true, mode: 0o700 });
	await chmod(dir, 0o700);
	// Write a sibling file and rename it over the old one, so a crash never leaves half a file.
	const temp = `${connectionsFile()}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify({ version: 1, connections }, null, "\t")}\n`, {
		mode: 0o600,
	});
	await rename(temp, connectionsFile());
};

let queue: Promise<unknown> = Promise.resolve();

/** Runs read-modify-write cycles one at a time, so concurrent saves cannot drop each other. */
const mutate = <T>(change: (connections: SavedConnection[]) => [SavedConnection[], T]) => {
	const run = queue.then(async () => {
		const [next, result] = change(await readAll());
		await writeAll(next);
		return result;
	});
	queue = run.catch(() => {});
	return run;
};

const notFound = () => new HTTPException(404, { message: "Saved connection not found" });

export const listSavedConnections = (): Promise<SavedConnection[]> =>
	queue.then(readAll, readAll);

export const findSavedConnection = async (id: string): Promise<SavedConnection> => {
	const found = (await listSavedConnections()).find((c) => c.id === id);
	if (!found) throw notFound();
	return found;
};

/** Saves a connection that just succeeded, or refreshes the entry it matches. */
export const recordConnection = (url: string): Promise<SavedConnection> =>
	mutate((connections) => {
		const existing = connections.find((c) => identity(c.url) === identity(url));
		const saved: SavedConnection = existing
			? { ...existing, url, lastUsedAt: Date.now() }
			: {
					id: randomUUID(),
					name: defaultConnectionName(url),
					url,
					color: null,
					lastUsedAt: Date.now(),
				};
		return [
			existing
				? connections.map((c) => (c.id === saved.id ? saved : c))
				: [...connections, saved],
			saved,
		];
	});

export const updateSavedConnection = (
	id: string,
	{ name, color }: UpdateConnectionSchemaType,
): Promise<SavedConnection> =>
	mutate((connections) => {
		const existing = connections.find((c) => c.id === id);
		if (!existing) throw notFound();
		const updated: SavedConnection = {
			...existing,
			name: name ?? existing.name,
			color: color === undefined ? existing.color : color,
		};
		return [connections.map((c) => (c.id === id ? updated : c)), updated];
	});

export const deleteSavedConnection = (id: string): Promise<void> =>
	mutate((connections) => {
		if (!connections.some((c) => c.id === id)) throw notFound();
		return [connections.filter((c) => c.id !== id), undefined];
	});
