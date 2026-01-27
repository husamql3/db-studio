import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { DEFAULTS } from "shared/constants";
import type { ApiError, DatabaseTypeSchema } from "shared/types";
import { logger } from "@/lib/logger";

/**
 * Setup interceptors for logging and error transformation
 */
const setupInterceptors = (instance: ReturnType<typeof axios.create>) => {
	// Request interceptor - add timing metadata and log
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

	// Response interceptor - log and transform errors
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

			// Create a proper Error object for react-query to handle correctly
			const apiError = new Error(message);
			(apiError as Error & { status: number; details?: unknown }).status = status;
			(apiError as Error & { status: number; details?: unknown }).details = details;

			return Promise.reject(apiError);
		},
	);

	return instance;
};

/**
 * Root API for /databases routes (no dbType prefix)
 * Used for fetching the dbType from the backend
 */
export const rootApi = setupInterceptors(
	axios.create({
		baseURL: DEFAULTS.BASE_URL,
	}),
);

/**
 * API for routes that require dbType prefix (/:dbType/...)
 * Used for fetching the data from the backend and setting the baseURL for the api
 */
export const api = setupInterceptors(
	axios.create({
		baseURL: DEFAULTS.BASE_URL,
	}),
);

/**
 * Store the dbType once fetched
 */
let dbType: DatabaseTypeSchema | null = null;

/**
 * Set the dbType and update the api baseURL
 * Called after the first successful request that returns dbType
 */
export const setDbType = (type: DatabaseTypeSchema): void => {
	if (dbType === type) return;

	dbType = type;
	api.defaults.baseURL = `${DEFAULTS.BASE_URL}/${dbType}`;
};

/**
 * Get the current dbType (returns null if not initialized)
 */
export const getDbType = (): DatabaseTypeSchema | null => dbType;
