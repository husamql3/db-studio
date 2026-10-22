import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import type { DatabaseError } from "pg";

/**
 * Database drivers are imported when the first connection to their engine opens. A process
 * connects to one engine, and importing all nine drivers took longer than the rest of the
 * server's startup.
 */
const imports = {
	pg: () => import("pg"),
	mysql: () => import("mysql2/promise"),
	mssql: () => import("mssql").then((module) => module.default),
	mongodb: () => import("mongodb"),
	sqlite: () => import("@libsql/client"),
	redis: () => import("ioredis"),
	duckdb: () => import("@duckdb/node-api"),
	oracle: () => import("oracledb").then((module) => module.default),
	clickhouse: () => import("@clickhouse/client"),
};

// Fails to compile when an engine has no import.
type Drivers = { [T in DatabaseTypeSchema]: Awaited<ReturnType<(typeof imports)[T]>> };

const loaded: Partial<Drivers> = {};

export const loadDriver = async <T extends DatabaseTypeSchema>(
	type: T,
): Promise<Drivers[T]> => {
	const driver = loaded[type] ?? ((await imports[type]()) as Drivers[T]);
	loaded[type] = driver;
	return driver;
};

/** The driver of an engine whose connection is open, for code that cannot await it. */
export const loadedDriver = <T extends DatabaseTypeSchema>(type: T): Drivers[T] => {
	const driver = loaded[type];
	if (!driver) throw new Error(`The ${type} driver is used before a connection opened`);
	return driver;
};

/** A PostgreSQL server error; only a process that loaded pg can have one. */
export const isPgDatabaseError = (error: unknown): error is DatabaseError =>
	loaded.pg !== undefined && error instanceof loaded.pg.DatabaseError;

/** Class 23 (foreign key, unique, not null, check): the user's data broke a constraint. */
export const isPgConstraintViolation = (error: unknown): error is DatabaseError =>
	isPgDatabaseError(error) && error.code?.startsWith("23") === true;
