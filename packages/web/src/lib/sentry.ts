import * as Sentry from "@sentry/react";

export const initSentry = (): void => {
	const dsn = import.meta.env.VITE_SENTRY_DSN;
	if (!dsn) return;

	Sentry.init({
		dsn,
		environment: import.meta.env.MODE,
		integrations: [Sentry.browserTracingIntegration()],
		tracesSampleRate: 0.1,
	});
};

export { Sentry };
