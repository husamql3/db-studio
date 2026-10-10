import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import { HTTPException } from "hono/http-exception";

type RequestContext = {
	requestId: string;
	operation: string;
	dbType?: DatabaseTypeSchema;
};

/** Identifies this server process, so logs written outside a request still correlate. */
const INSTANCE_ID = randomUUID();
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const requestContext = new AsyncLocalStorage<RequestContext>();

/** A caller-supplied ID is kept only when it is a plain token, so it stays safe to log. */
export const resolveRequestId = (incoming: string | undefined): string =>
	incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();

export const runWithRequestContext = <T>(context: RequestContext, callback: () => T): T =>
	requestContext.run(context, callback);

export const currentRequestId = (): string | undefined => requestContext.getStore()?.requestId;

const safeErrorType = (error: unknown): string => {
	const name =
		error instanceof HTTPException
			? "HTTPException"
			: error instanceof Error
				? error.name
				: "Error";
	return /^[A-Za-z][A-Za-z0-9]{0,49}$/.test(name) ? name : "Error";
};

const SAFE_CODE = /^[A-Z0-9_-]{2,32}$/;

/**
 * node-postgres raises its connection failures as a bare `Error` with no code,
 * so they are told apart by their fixed message. Order matters: the connect
 * timeout message also starts with "Connection terminated".
 */
const CODELESS_FAILURES: Array<[RegExp, string]> = [
	[/^timeout exceeded when trying to connect$/, "POOL_ACQUIRE_TIMEOUT"],
	[/^(timeout expired|Connection terminated due to connection timeout)$/, "CONNECT_TIMEOUT"],
	[/^Connection terminated/, "CONNECTION_TERMINATED"],
	[/^Client has encountered a connection error/, "CONNECTION_BROKEN"],
];

/**
 * The driver's own error code, which is what separates one failure from another
 * once the message is dropped. Drivers disagree on where it lives: `number` on
 * SQL Server (whose `code` is always EREQUEST), a numeric `code` on MongoDB,
 * `ORA-00942` on Oracle, the reply prefix on Redis, and `cause.code` under a
 * fetch-based driver's "fetch failed".
 */
const safeErrorCode = (error: unknown): string | undefined => {
	if (!(error instanceof Error)) return undefined;
	const { code, errno, number, cause } = error as Error & {
		code?: unknown;
		errno?: unknown;
		number?: unknown;
	};
	if (typeof number === "number" && Number.isSafeInteger(number)) return String(number);
	if (typeof code === "string" && SAFE_CODE.test(code)) return code;
	if (typeof code === "number" && Number.isSafeInteger(code)) return String(code);
	if (typeof errno === "number" && Number.isSafeInteger(errno)) return String(errno);
	if (error.name === "ReplyError") return error.message.match(/^[A-Z]{3,32}(?= |$)/)?.[0];
	return (
		CODELESS_FAILURES.find(([pattern]) => pattern.test(error.message))?.[1] ??
		safeErrorCode(cause)
	);
};

/** The error an HTTPException wraps is the one worth diagnosing. */
export const diagnosticErrorFor = (error: unknown): unknown =>
	error instanceof HTTPException && error.cause ? error.cause : error;

export const errorFields = (error: unknown): { error_type: string; error_code?: string } => {
	const diagnosticError = diagnosticErrorFor(error);
	return {
		error_type: safeErrorType(diagnosticError),
		error_code: safeErrorCode(diagnosticError),
	};
};

/**
 * One JSON line on stderr. Every line carries `instance_id`, and inside a request
 * also the `request_id`, operation and database type of that request.
 */
export const writeOperationalLog = (
	level: "info" | "warn" | "error",
	event: string,
	fields: Record<string, string | number | undefined> = {},
): void => {
	const context = requestContext.getStore();
	process.stderr.write(
		`${JSON.stringify({
			timestamp: new Date().toISOString(),
			level,
			event,
			instance_id: INSTANCE_ID,
			request_id: context?.requestId,
			operation: context?.operation,
			db_type: context?.dbType,
			...fields,
		})}\n`,
	);
};
