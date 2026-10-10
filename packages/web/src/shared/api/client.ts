import { DEFAULTS } from "@db-studio/shared/constants";
import type { ApiError, DatabaseTypeSchema } from "@db-studio/shared/types";
import axios, {
	type AxiosError,
	type AxiosInstance,
	type InternalAxiosRequestConfig,
} from "axios";
import { logger } from "@/lib/logger";
import { Sentry } from "@/lib/sentry";

/** `crypto.randomUUID` only exists on secure origins; db-studio is also served over plain LAN HTTP. */
const newRequestId = (): string =>
	crypto.randomUUID?.() ??
	Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");

const setupInterceptors = (instance: AxiosInstance) => {
	instance.interceptors.request.use(
		(config) => {
			// The server adopts this ID, so its log line and error report name the same request.
			const requestId = newRequestId();
			config.headers.set("X-Request-Id", requestId);
			(
				config as InternalAxiosRequestConfig & {
					metadata?: { startTime: number };
				}
			).metadata = {
				startTime: performance.now(),
			};
			logger.request(config);
			Sentry.addBreadcrumb({
				category: "db_studio.http",
				data: {
					operation: apiOperationForRequest(config.method, config.url),
					method: config.method?.toUpperCase(),
					request_id: requestId,
				},
				level: "info",
			});
			return config;
		},
		(error) => Promise.reject(error),
	);

	instance.interceptors.response.use(
		(response) => {
			const startTime =
				(
					response.config as InternalAxiosRequestConfig & {
						metadata?: { startTime: number };
					}
				).metadata?.startTime ?? 0;
			const duration = Math.round(performance.now() - startTime);
			logger.response(response, duration);
			return response;
		},
		(error: AxiosError<ApiError>) => {
			const startTime =
				(
					error.config as
						| (InternalAxiosRequestConfig & {
								metadata?: { startTime: number };
						  })
						| undefined
				)?.metadata?.startTime ?? 0;
			const duration = Math.round(performance.now() - startTime);
			logger.error(error, duration);

			const status = error.response?.status ?? 500;
			const data = error.response?.data;
			const message = data?.error ?? error.message ?? "An error occurred";
			const details = data?.details;
			const requestId: string | undefined = error.config?.headers
				.get("X-Request-Id")
				?.toString();
			const apiError = Object.assign(new Error(message), { status, details, requestId });
			if (!error.response) {
				const operation = apiOperationForRequest(error.config?.method, error.config?.url);
				const errorCode =
					typeof error.code === "string" && /^[A-Z0-9_]{2,32}$/.test(error.code)
						? error.code
						: "unknown";
				const reportedMessage = `${operation} did not reach the server (${errorCode})`;
				const reportedError = new Error(reportedMessage);
				reportedError.name = "AxiosError";
				if (error.stack) {
					const frames = error.stack.split("\n").slice(1).filter(isStackFrame);
					reportedError.stack = [`AxiosError: ${reportedMessage}`, ...frames].join("\n");
				}
				Sentry.captureException(reportedError, {
					tags: {
						source: "client",
						error_kind: "network",
						operation,
						error_code: errorCode,
						...(requestId ? { request_id: requestId } : {}),
					},
					fingerprint: ["network", operation, errorCode],
				});
			}

			return Promise.reject(apiError);
		},
	);

	return instance;
};

const isStackFrame = (line: string): boolean => /^\s*at\s/.test(line);

export const apiOperationForRequest = (method?: string, url?: string): string => {
	const resource = url
		?.replace(/[?#].*$/, "")
		.match(/\/(databases|tables|records|query|keys|chat)(?:\/|$)/)?.[1];
	return `${method?.toLowerCase() ?? "unknown"}_${resource ?? "other"}`;
};

export const getBaseUrl = (): string => {
	if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
	if (
		import.meta.env.DEV &&
		typeof window !== "undefined" &&
		window.location?.hostname.endsWith(".localhost") &&
		window.location.port
	) {
		return `${window.location.protocol}//api.db-studio.localhost:${window.location.port}`;
	}
	if (import.meta.env.DEV) return DEFAULTS.BASE_URL;
	return globalThis.location?.origin ?? DEFAULTS.BASE_URL;
};

export class ApiClient {
	readonly rootApi: AxiosInstance;
	readonly api: AxiosInstance;
	private dbType: DatabaseTypeSchema | null = null;
	private readonly resolveBaseUrl: () => string;

	constructor(resolveBaseUrl: () => string = getBaseUrl) {
		this.resolveBaseUrl = resolveBaseUrl;
		// API is namespaced under API_PREFIX so it never collides with SPA
		// routes served from the same origin. See db-studio#214.
		const baseURL = `${this.resolveBaseUrl()}${DEFAULTS.API_PREFIX}`;
		this.rootApi = setupInterceptors(axios.create({ baseURL }));
		this.api = setupInterceptors(axios.create({ baseURL }));
	}

	setDbType(type: DatabaseTypeSchema): void {
		if (this.dbType === type) return;

		this.dbType = type;
		this.api.defaults.baseURL = `${this.resolveBaseUrl()}${DEFAULTS.API_PREFIX}/${type}`;
	}

	getDbType(): DatabaseTypeSchema | null {
		return this.dbType;
	}
}

export const apiClient = new ApiClient();
export const rootApi = apiClient.rootApi;
export const api = apiClient.api;
export const setDbType = (type: DatabaseTypeSchema): void => apiClient.setDbType(type);
export const getDbType = (): DatabaseTypeSchema | null => apiClient.getDbType();
