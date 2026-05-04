import axios, {
	type AxiosError,
	type AxiosInstance,
	type InternalAxiosRequestConfig,
} from "axios";
import { DEFAULTS } from "shared/constants";
import type { ApiError, DatabaseTypeSchema } from "shared/types";
import { logger } from "@/lib/logger";

const setupInterceptors = (instance: AxiosInstance) => {
	instance.interceptors.request.use(
		(config) => {
			(
				config as InternalAxiosRequestConfig & {
					metadata?: { startTime: number };
				}
			).metadata = {
				startTime: performance.now(),
			};
			logger.request(config);
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
			const apiError = new Error(message);
			(apiError as Error & { status: number; details?: unknown }).status = status;
			(apiError as Error & { status: number; details?: unknown }).details = details;

			return Promise.reject(apiError);
		},
	);

	return instance;
};

export const getBaseUrl = (): string => {
	if (import.meta.env.DEV) return "/api";
	return globalThis.location?.origin ?? DEFAULTS.BASE_URL;
};

export class ApiClient {
	readonly rootApi: AxiosInstance;
	readonly api: AxiosInstance;
	private dbType: DatabaseTypeSchema | null = null;
	private readonly resolveBaseUrl: () => string;

	constructor(resolveBaseUrl: () => string = getBaseUrl) {
		this.resolveBaseUrl = resolveBaseUrl;
		const baseURL = this.resolveBaseUrl();
		this.rootApi = setupInterceptors(axios.create({ baseURL }));
		this.api = setupInterceptors(axios.create({ baseURL }));
	}

	setDbType(type: DatabaseTypeSchema): void {
		if (this.dbType === type) return;

		this.dbType = type;
		this.api.defaults.baseURL = `${this.resolveBaseUrl()}/${type}`;
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
