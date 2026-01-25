import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";

/**
 * Browser logger with timestamps and colors
 */
export const logger = {
	styles: {
		timestamp: "color: #6b7280; font-weight: normal;",
		method: {
			GET: "color: #22c55e; font-weight: bold;",
			POST: "color: #3b82f6; font-weight: bold;",
			PUT: "color: #f59e0b; font-weight: bold;",
			PATCH: "color: #8b5cf6; font-weight: bold;",
			DELETE: "color: #ef4444; font-weight: bold;",
		} as Record<string, string>,
		url: "color: #06b6d4; font-weight: normal;",
		status: {
			success: "color: #22c55e; font-weight: bold;",
			error: "color: #ef4444; font-weight: bold;",
		},
		duration: "color: #a855f7; font-weight: normal;",
		label: "color: #64748b; font-weight: normal;",
	},

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
		const methodStyle = this.styles.method[method] ?? this.styles.method.GET;

		console.groupCollapsed(
			`%c[${this.getTimestamp()}] %c${method} %c${config.url}`,
			this.styles.timestamp,
			methodStyle,
			this.styles.url,
		);

		if (config.params && Object.keys(config.params).length > 0) {
			console.log("%cParams:", this.styles.label, config.params);
		}
		if (config.data) {
			console.log("%cBody:", this.styles.label, config.data);
		}

		console.groupEnd();
	},

	response(response: AxiosResponse, duration: number) {
		const method = response.config.method?.toUpperCase() ?? "GET";
		const methodStyle = this.styles.method[method] ?? this.styles.method.GET;
		const isSuccess = response.status >= 200 && response.status < 300;
		const statusStyle = isSuccess ? this.styles.status.success : this.styles.status.error;

		console.groupCollapsed(
			`%c[${this.getTimestamp()}] %c${method} %c${response.config.url} %c${response.status} %c(${duration}ms)`,
			this.styles.timestamp,
			methodStyle,
			this.styles.url,
			statusStyle,
			this.styles.duration,
		);

		console.log("%cResponse:", this.styles.label, response.data);
		console.groupEnd();
	},

	error(error: AxiosError, duration: number) {
		const method = error.config?.method?.toUpperCase() ?? "GET";
		const methodStyle = this.styles.method[method] ?? this.styles.method.GET;
		const status = error.response?.status ?? "ERR";

		console.groupCollapsed(
			`%c[${this.getTimestamp()}] %c${method} %c${error.config?.url} %c${status} %c(${duration}ms)`,
			this.styles.timestamp,
			methodStyle,
			this.styles.url,
			this.styles.status.error,
			this.styles.duration,
		);

		console.log("%cError:", this.styles.label, error.response?.data ?? error.message);
		console.groupEnd();
	},
};
