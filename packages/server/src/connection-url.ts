import { resolve } from "node:path";
import {
	DATABASE_ENGINES,
	type DatabaseTypeSchema,
	dbTypeFromProtocol,
	type ProtocolTraits,
} from "@db-studio/shared/types";

/** A connection URL parsed once: what every connector, label and check reads. */
export interface ConnectionUrl {
	dbType: DatabaseTypeSchema;
	/** The scheme as typed, lowercased: `cockroachdb`, `rediss`, `libsql`. */
	scheme: string;
	/**
	 * The URL the driver opens: an alias's scheme rewritten to the one its driver understands,
	 * with the alias's default port pinned so the driver does not substitute its own.
	 */
	driverUrl: string;
	host: string;
	port: number;
	user: string;
	password: string;
	/** The decoded path without its slashes: a database name, a Redis index, an Oracle service. */
	database: string;
	params: URLSearchParams;
	/** The database file of a file engine, `:memory:` included; `null` for any other URL. */
	file: string | null;
	inMemory: boolean;
}

/** Where a server URL points. */
export type ServerAddress = Pick<ConnectionUrl, "host" | "port">;

const SCHEME = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/is;

const protocolOf = (url: string) => {
	const [, typed = "", rest = ""] = url.match(SCHEME) ?? [];
	const scheme = typed.toLowerCase();
	const dbType = dbTypeFromProtocol(scheme);

	const protocols: Readonly<Record<string, ProtocolTraits>> | undefined =
		dbType && DATABASE_ENGINES[dbType].protocols;

	return { typed, scheme, rest, dbType, traits: protocols?.[scheme] };
};

/**
 * Decode a URL's username, password or path segment, which `URL` keeps percent-encoded
 * (`p%40ss` for `p@ss`). A `%` that starts no escape is kept as typed.
 */
const decodeUrlPart = (value: string): string => {
	try {
		return decodeURIComponent(value.replace(/%(?![0-9a-fA-F]{2})/g, "%25"));
	} catch {
		return value;
	}
};

/** Throws when the URL is malformed or names an unsupported engine. */
export const parseConnectionUrl = (url: string): ConnectionUrl => {
	if (!SCHEME.test(url)) throw new Error("The connection URL is not a valid URL");
	const { scheme, rest, dbType, traits } = protocolOf(url);

	if (!dbType || !traits) {
		const supported = Object.values(DATABASE_ENGINES)
			.map(({ label, protocols }) => `${label} (${Object.keys(protocols).join(", ")})`)
			.join(", ");

		throw new Error(`Unsupported database type: ${scheme}. Supported types: ${supported}.`);
	}

	if ("file" in traits) {
		return {
			dbType,
			scheme,
			driverUrl: url,
			host: "localhost",
			port: 0,
			user: "",
			password: "",
			database: "",
			params: new URLSearchParams(),
			file: rest,
			inMemory: rest === ":memory:",
		};
	}

	const driverScheme = "driverScheme" in traits ? traits.driverScheme : undefined;
	let parsed: URL;

	try {
		parsed = new URL(driverScheme ? `${driverScheme}://${rest}` : url);
	} catch {
		throw new Error("The connection URL is not a valid URL");
	}

	const defaultPort = "defaultPort" in traits ? traits.defaultPort : 0;

	if (driverScheme) parsed.port ||= String(defaultPort);

	return {
		dbType,
		scheme,
		driverUrl: driverScheme ? parsed.toString() : url,
		host: "hosted" in traits ? parsed.hostname : parsed.hostname || "localhost",
		port: Number.parseInt(parsed.port, 10) || defaultPort,
		user: decodeUrlPart(parsed.username),
		password: decodeUrlPart(parsed.password),
		database: decodeUrlPart(parsed.pathname.replace(/^\/+|\/+$/g, "")),
		params: parsed.searchParams,
		file: null,
		inMemory: false,
	};
};

/** The engine a URL's scheme names, without validating the rest. */
export const urlDbType = (url: string) => protocolOf(url).dbType;

/** Trims the URL and makes a relative SQLite or DuckDB path absolute against `cwd`. */
export const normalizeConnectionUrl = (url: string, cwd = process.cwd()): string => {
	const trimmed = url.trim();
	const { typed, rest, traits } = protocolOf(trimmed);

	if (!traits || !("file" in traits) || rest === ":memory:" || rest.startsWith("/")) {
		return trimmed;
	}

	return `${typed}://${resolve(cwd, rest)}`;
};
