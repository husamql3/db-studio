import * as Sentry from "@sentry/react";

const OFFICIAL_SENTRY_DSN =
	"https://c1a01551ba00da0aee2c5e9c977906e7@o4509725125181440.ingest.de.sentry.io/4512040493318224";

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
			delete event.breadcrumbs;
			delete event.message;
			delete event.contexts;
			delete event.extra;
			for (const exception of event.exception?.values ?? []) exception.value = "Client error";
			return event;
		},
		beforeSendSpan(span) {
			const description = span.description
				?.replace(/[?#].*$/, "")
				.replace(
					/\/api\/(?:pg|mysql|mssql|mongodb|sqlite|redis)\/(databases|tables|records|query|keys|chat)(?:\/\S*)?/g,
					"/api/$1",
				)
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
