import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";

/**
 * Browser logger with timestamps and colors
 */
export const logger = {
	getTimestamp(): string {
		return new Date().toLocaleTimeString("en-US", {
			hour12: false,
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			fractionalSecondDigits: 3,
		});
	},

	request(config: InternalAxiosRequestConfig & { metadata?: { startTime: number } }) {
		const method = config.method?.toUpperCase() ?? "GET";

		console.groupCollapsed(`%c[${this.getTimestamp()}] %c${method} %c${config.url}`);

		if (config.params && Object.keys(config.params).length > 0) {
			console.log("Params:", config.params);
		}
		if (config.data) {
			console.log("Body:", config.data);
		}

		console.groupEnd();
	},

	response(response: AxiosResponse, duration: number) {
		const method = response.config.method?.toUpperCase() ?? "GET";

		console.groupCollapsed(
			`[${this.getTimestamp()}] ${method} ${response.config.url} ${response.status} (${duration}ms)`,
			method,
			response.config.url,
			response.status,
			duration,
		);

		console.log("Response:", response.data);
		console.groupEnd();
	},

	error(error: AxiosError, duration: number) {
		const method = error.config?.method?.toUpperCase() ?? "GET";
		const status = error.response?.status ?? "ERR";

		console.groupCollapsed(
			`%c[${this.getTimestamp()}] %c${method} %c${error.config?.url} %c${status} %c(${duration}ms)`,
			method,
			error.config?.url,
			status,
			duration,
		);

		console.log("%cError:", error.response?.data ?? error.message);
		console.groupEnd();
	},
};
