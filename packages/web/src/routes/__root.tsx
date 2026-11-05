import { Toaster } from "@db-studio/ui/sonner";
import { Spinner } from "@db-studio/ui/spinner";
import { TooltipProvider } from "@db-studio/ui/tooltip";
import { aiDevtoolsPlugin } from "@tanstack/react-ai-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRoute,
	Link,
	Navigate,
	Outlet,
	useLocation,
	useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { NuqsAdapter } from "nuqs/adapters/react";
import { useEffect, useLayoutEffect } from "react";
import { toast } from "sonner";
import { CommandPalette } from "@/components/components/command-palette";
import { useConnectionChangeWatcher, useConnections } from "@/features/connections";
import { SettingsOverlay } from "@/features/settings";
import { TableBuilderOverlay } from "@/features/table-builder";
import { useInitializeDatabase } from "@/hooks/use-databases-list";
import { useTheme } from "@/hooks/use-theme";
import { initPosthog, posthogAnalytics } from "@/lib/posthog";
import { sectionOf } from "@/lib/sections";
import { initSentry } from "@/lib/sentry";
import type { ApiError } from "@/shared/api";
import { useDatabaseStore } from "@/stores/database.store";

const connectDevtoolsServerBus =
	import.meta.env.DEV && import.meta.env.VITE_TANSTACK_SERVER_BUS === "true";

const FullPageSpinner = () => (
	<div className="flex items-center justify-center h-screen">
		<Spinner
			size="size-8"
			color="bg-primary"
		/>
	</div>
);

/** The app for an open connection. Remounted on every switch, so it initializes afresh. */
const ConnectedApp = () => {
	const { dbType } = useDatabaseStore();
	// Fetches the databases list and the current database, then selects one.
	const { isLoading, isInitialized, error } = useInitializeDatabase();

	useEffect(() => {
		if (error && dbType) {
			// SAFETY: both queries are API requests, and every failed request rejects with ApiError.
			const { status } = error as ApiError;
			posthogAnalytics.capture("connection_error", {
				db_type: dbType,
				status_bucket: status ? (status >= 500 ? "5xx" : "4xx") : "network",
			});
		}
	}, [error, dbType]);

	if ((isLoading || !isInitialized) && !error) return <FullPageSpinner />;

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-screen gap-3 text-center">
				<p className="text-destructive font-medium">Failed to connect to the database</p>
				<p className="text-muted-foreground text-sm max-w-sm">
					{error.message || "An unexpected error occurred"}
				</p>
				<Link
					to="/connect"
					className="text-sm underline underline-offset-4"
				>
					Choose another connection
				</Link>
			</div>
		);
	}

	return <Outlet />;
};

export const Route = createRootRoute({
	component: function RootRouteComponent() {
		const { resolvedTheme } = useTheme();

		// A layout effect, so the first frame already has the stored theme.
		useLayoutEffect(() => {
			const root = document.documentElement;
			root.classList.toggle("dark", resolvedTheme === "dark");
			root.classList.toggle("light", resolvedTheme === "light");
		}, [resolvedTheme]);
		const pathname = useLocation({ select: (location) => location.pathname });
		const { active, isLoading, error } = useConnections();
		useConnectionChangeWatcher();

		// From the rendered matches, not the URL: while the Connect page's code loads, the URL is
		// already /connect but the outlet still renders the previous page, which needs a database.
		const isConnectPage = useRouterState({
			select: (state) => state.matches.some((match) => match.routeId === "/connect"),
		});

		useEffect(() => {
			const noticeKey = "db-studio-telemetry-notice-shown";
			void initPosthog().then((telemetry) => {
				if (!telemetry?.enabled) return;
				void initSentry();

				if (!localStorage.getItem(noticeKey)) {
					localStorage.setItem(noticeKey, "1");
					toast.info("Anonymous usage and reliability data helps improve DB Studio.", {
						description: "Queries, schemas, names, and values are never collected.",
						duration: 8_000,
					});
				}
			});
		}, []);

		useEffect(() => {
			const page =
				pathname === "/connect"
					? "connect"
					: pathname === "/"
						? "home"
						: (sectionOf(pathname)?.id ?? "home");

			posthogAnalytics.capture("page_viewed", { page });
		}, [pathname]);

		// Pieces that query the open database stay out of the Connect page.
		const isInApp = Boolean(active) && !isConnectPage;

		const content = isConnectPage ? (
			<Outlet />
		) : isLoading ? (
			<FullPageSpinner />
		) : error ? (
			<div className="flex flex-col items-center justify-center h-screen gap-3 text-center">
				<p className="text-destructive font-medium">Cannot reach the DB Studio server</p>
				<p className="text-muted-foreground text-sm max-w-sm">{error.message}</p>
			</div>
		) : !active ? (
			<Navigate to="/connect" />
		) : (
			<ConnectedApp key={active.connectionId} />
		);

		return (
			<TooltipProvider>
				<NuqsAdapter
					fullPageNavigationOnShallowFalseUpdates
					defaultOptions={{ shallow: true, clearOnDefault: true }}
				>
					{content}
					{/* Inside the adapter: it reads the open table's schema from the URL. */}
					{isInApp && <CommandPalette />}
				</NuqsAdapter>
				<Toaster
					position="top-right"
					theme={resolvedTheme}
				/>
				{/* Global overlays */}
				{isInApp && <TableBuilderOverlay />}
				<SettingsOverlay />
				{/* Devtools */}
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						{
							name: "React Query",
							render: (
								<ReactQueryDevtools
									initialIsOpen={false}
									buttonPosition="bottom-left"
								/>
							),
						},
						aiDevtoolsPlugin(),
					]}
					eventBusConfig={{
						connectToServerBus: connectDevtoolsServerBus,
					}}
				/>
			</TooltipProvider>
		);
	},
});
