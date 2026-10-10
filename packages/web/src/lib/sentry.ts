import { DATABASE_TYPES } from "@db-studio/shared/types";
import * as Sentry from "@sentry/react";

const DB_SCOPED_API_PATH = new RegExp(
	`/api/(?:${DATABASE_TYPES.join("|")})/(databases|tables|records|query|keys|chat)(?:/\\S*)?`,
	"g",
);

const OFFICIAL_SENTRY_DSN =
	"https://c1a01551ba00da0aee2c5e9c977906e7@o4509725125181440.ingest.de.sentry.io/4512040493318224";

/** Family and major version only, e.g. `safari-18`; the full user agent is never sent. */
const browserTag = (): string => {
	const match = navigator.userAgent.match(/(Edg|OPR|Firefox|Chrome|Version)\/(\d+)/);
	if (!match) return "other";
	const family = { Edg: "edge", OPR: "opera", Firefox: "firefox", Chrome: "chrome" }[match[1]];
	return `${family ?? "safari"}-${match[2]}`;
};

export const initSentry = (): void => {
	const dsn = import.meta.env.VITE_SENTRY_DSN ?? OFFICIAL_SENTRY_DSN;
	if (!dsn || import.meta.env.DEV) return;

	Sentry.init({
		dsn,
		environment: import.meta.env.MODE,
		release: `db-studio@${import.meta.env.VITE_APP_VERSION}`,
		integrations: [Sentry.browserTracingIntegration()],
		tracesSampleRate: 0.1,
		sendDefaultPii: false,
		beforeSend(event) {
			delete event.request;
			delete event.user;
			delete event.message;
			delete event.contexts;
			delete event.extra;
			event.tags = { ...event.tags, browser: browserTag() };
			event.breadcrumbs = event.breadcrumbs
				?.filter((breadcrumb) => breadcrumb.category === "db_studio.http")
				.map((breadcrumb) => ({
					category: breadcrumb.category,
					level: breadcrumb.level,
					timestamp: breadcrumb.timestamp,
					data: {
						operation: breadcrumb.data?.operation,
						method: breadcrumb.data?.method,
						request_id: breadcrumb.data?.request_id,
					},
				}));
			// Only the network report builds its message from fixed vocabulary; any
			// other message may quote a table or database name.
			if (event.tags?.error_kind !== "network") {
				for (const exception of event.exception?.values ?? [])
					exception.value = "Client error";
			}
			return event;
		},
		beforeSendSpan(span) {
			const description = span.description
				?.replace(/[?#].*$/, "")
				.replace(DB_SCOPED_API_PATH, "/api/$1")
				.replace(/\/(table|schema|runner)\/[^/\s]+/g, "/$1/:id");
			return { ...span, description, data: {} };
		},
		beforeSendTransaction(event) {
			if (event.transaction) {
				event.transaction = event.transaction.replace(
					/\/(table|schema|runner)\/[^/]+/g,
					"/$1/:id",
				);
			}
			return event;
		},
	});
};

export { Sentry };
