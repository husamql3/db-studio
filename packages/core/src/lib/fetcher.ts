import { DEFAULTS } from "shared/constants";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface FetcherConfig {
	baseUrl?: string;
	defaultHeaders?: HeadersInit;
}

interface RequestOptions<TBody = unknown> {
	method?: HttpMethod;
	params?: Record<string, string | number | boolean | undefined | null>;
	body?: TBody;
	headers?: HeadersInit;
	/**
	 * If true, throws an error when response is not ok
	 * @default true
	 */
	throwOnError?: boolean;
}

interface FetcherResponse<T> {
	data: T;
	ok: boolean;
	status: number;
}

class FetcherError extends Error {
	status: number;
	data: unknown;

	constructor(message: string, status: number, data?: unknown) {
		super(message);
		this.name = "FetcherError";
		this.status = status;
		this.data = data;
	}
}

/**
 * Creates a configured fetcher instance with a base URL and default options
 */
function createFetcher(config: FetcherConfig = {}) {
	const { baseUrl = DEFAULTS.BASE_URL, defaultHeaders = {} } = config;

	/**
	 * Core fetch function that handles URL construction, params, and response parsing
	 */
	async function request<TResponse, TBody = unknown>(
		endpoint: string,
		options: RequestOptions<TBody> = {},
	): Promise<TResponse> {
		const {
			method = "GET",
			params,
			body,
			headers = {},
			throwOnError = true,
		} = options;

		// Build URL with search params
		const url = new URL(endpoint, baseUrl);

		if (params) {
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined && value !== null && value !== "") {
					url.searchParams.set(key, String(value));
				}
			}
		}

		// Merge headers
		const mergedHeaders: HeadersInit = {
			...defaultHeaders,
			...headers,
		};

		// Add Content-Type for requests with body
		if (body && !("Content-Type" in mergedHeaders)) {
			(mergedHeaders as Record<string, string>)["Content-Type"] =
				"application/json";
		}

		const fetchOptions: RequestInit = {
			method,
			headers: mergedHeaders,
		};

		if (body) {
			fetchOptions.body = JSON.stringify(body);
		}

		const response = await fetch(url.toString(), fetchOptions);
		const data = await response.json();

		if (!response.ok && throwOnError) {
			const errorMessage =
				data?.message || data?.error || data?.detail || `Request failed`;
			throw new FetcherError(errorMessage, response.status, data);
		}

		return data as TResponse;
	}

	// Convenience methods
	return {
		/**
		 * Raw request method for full control
		 */
		request,

		/**
		 * GET request
		 */
		get<TResponse>(
			endpoint: string,
			params?: RequestOptions["params"],
			options?: Omit<RequestOptions, "method" | "body" | "params">,
		) {
			return request<TResponse>(endpoint, {
				...options,
				method: "GET",
				params,
			});
		},

		/**
		 * POST request
		 */
		post<TResponse, TBody = unknown>(
			endpoint: string,
			body?: TBody,
			options?: Omit<RequestOptions<TBody>, "method" | "body">,
		) {
			return request<TResponse, TBody>(endpoint, {
				...options,
				method: "POST",
				body,
			});
		},

		/**
		 * PUT request
		 */
		put<TResponse, TBody = unknown>(
			endpoint: string,
			body?: TBody,
			options?: Omit<RequestOptions<TBody>, "method" | "body">,
		) {
			return request<TResponse, TBody>(endpoint, {
				...options,
				method: "PUT",
				body,
			});
		},

		/**
		 * PATCH request
		 */
		patch<TResponse, TBody = unknown>(
			endpoint: string,
			body?: TBody,
			options?: Omit<RequestOptions<TBody>, "method" | "body">,
		) {
			return request<TResponse, TBody>(endpoint, {
				...options,
				method: "PATCH",
				body,
			});
		},

		/**
		 * DELETE request
		 */
		delete<TResponse, TBody = unknown>(
			endpoint: string,
			body?: TBody,
			options?: Omit<RequestOptions<TBody>, "method" | "body">,
		) {
			return request<TResponse, TBody>(endpoint, {
				...options,
				method: "DELETE",
				body,
			});
		},

		/**
		 * Create a new fetcher with a different base URL
		 */
		withBaseUrl(newBaseUrl: string) {
			return createFetcher({ ...config, baseUrl: newBaseUrl });
		},

		/**
		 * Create a new fetcher with additional default headers
		 */
		withHeaders(additionalHeaders: HeadersInit) {
			return createFetcher({
				...config,
				defaultHeaders: { ...defaultHeaders, ...additionalHeaders },
			});
		},
	};
}

// Default fetcher instance using DEFAULTS.BASE_URL
export const fetcher = createFetcher();

// Export for custom configurations
export { createFetcher, FetcherError };
export type { FetcherConfig, RequestOptions, FetcherResponse, HttpMethod };
