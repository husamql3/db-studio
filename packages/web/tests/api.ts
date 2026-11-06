import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { api } from "@/shared/api/client";

export type SentRequest = {
	method: string;
	url: string;
	params: Record<string, unknown>;
	body: unknown;
};

type Answer = { status?: number; data: unknown };

/**
 * Answers the requests the app sends through `api` from `routes`, keyed "METHOD /path" (the
 * path below the engine prefix), the way the server would, and returns every request sent. A
 * route is a fixed `{ status, data }` answer or a function of the request; an unlisted route
 * answers 404. Statuses from 400 up reject the way a server error does.
 */
export const fakeServer = (
	routes: Record<string, Answer | ((request: SentRequest) => Answer)>,
) => {
	const sent: SentRequest[] = [];

	api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
		const request: SentRequest = {
			method: (config.method ?? "get").toUpperCase(),
			url: config.url ?? "",
			params: config.params ?? {},
			body: typeof config.data === "string" ? JSON.parse(config.data) : config.data,
		};

		sent.push(request);

		const route = routes[`${request.method} ${request.url}`];
		const answer = typeof route === "function" ? route(request) : route;
		const status = answer?.status ?? (answer ? 200 : 404);

		const response: AxiosResponse = {
			config,
			data: answer?.data ?? { error: "Not found" },
			headers: {},
			status,
			statusText: String(status),
		};

		if (status >= 400) {
			throw new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, undefined, response);
		}

		return response;
	};

	return sent;
};
