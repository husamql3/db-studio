import { Toaster } from "@db-studio/ui/sonner";
import { Spinner } from "@db-studio/ui/spinner";
import { aiDevtoolsPlugin } from "@tanstack/react-ai-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { NuqsAdapter } from "nuqs/adapters/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { CommandPalette } from "@/components/components/command-palette";
import { SettingsOverlay } from "@/features/settings";
import { TableBuilderOverlay } from "@/features/table-builder";
import { useInitializeDatabase } from "@/hooks/use-databases-list";
import { useTheme } from "@/hooks/use-theme";
import { initPosthog, posthogAnalytics } from "@/lib/posthog";
import { initSentry } from "@/lib/sentry";
import { useDatabaseStore } from "@/stores/database.store";

const darkModeScript = `
  try {
    const stored = localStorage.getItem('db-studio-personal-preferences');
    const theme = stored ? JSON.parse(stored)?.state?.theme : 'dark';
    const isDark = theme === 'dark' || (theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false);
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#09090b');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#ffffff');
    }
  } catch (_) {
    document.documentElement.classList.add('dark');
  }

  try {
    if (/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)) {
      document.documentElement.classList.add('os-macos');
    }
  } catch (_) {}
`;

const connectDevtoolsServerBus =
	import.meta.env.DEV && import.meta.env.VITE_TANSTACK_SERVER_BUS === "true";

export const Route = createRootRoute({
	component: function RootRouteComponent() {
		useTheme();
		const pathname = useLocation({ select: (location) => location.pathname });

		const { dbType } = useDatabaseStore();
		// Initialize database connection when the component mounts, fetches databases list, current db, and selects first db as fallback
		const { isLoading, isInitialized, error } = useInitializeDatabase();

		useEffect(() => {
			if (error && dbType) {
				const status = (error as { status?: number })?.status;
				posthogAnalytics.capture("connection_error", {
					db_type: dbType,
					status_bucket: status ? (status >= 500 ? "5xx" : "4xx") : "network",
				});
			}
		}, [error, dbType]);

		useEffect(() => {
			const noticeKey = "db-studio-telemetry-notice-shown";
			void initPosthog().then((telemetry) => {
				if (!telemetry?.enabled) return;
				initSentry();
				if (!localStorage.getItem(noticeKey)) {
					localStorage.setItem(noticeKey, "1");
					toast.info("Anonymous usage and reliability data helps improve DB Studio.", {
						description:
							"Queries, schemas, names, and values are never collected. Disable it in Settings.",
						duration: 8_000,
					});
				}
			});
		}, []);

		useEffect(() => {
			const firstSegment = pathname.split("/").filter(Boolean)[0];
			const pages = [
				"browser",
				"table",
				"schema",
				"runner",
				"visualizer",
				"logs",
				"indexes",
			] as const;
			const page = pages.find((candidate) => candidate === firstSegment) ?? "home";
			posthogAnalytics.capture("page_viewed", { page });
		}, [pathname]);

		// Show loading until both queries complete AND database is initialized in store
		const showLoading = (isLoading || !isInitialized) && !error;

		return (
			<>
				<script
					defer
					src={`data:text/javascript;base64,${btoa(darkModeScript)}`}
				/>

				<NuqsAdapter
					fullPageNavigationOnShallowFalseUpdates
					defaultOptions={{ shallow: true, clearOnDefault: true }}
				>
					{showLoading ? (
						<div className="flex items-center justify-center h-screen">
							<Spinner
								size="size-8"
								color="bg-primary"
							/>
						</div>
					) : error ? (
						<div className="flex flex-col items-center justify-center h-screen gap-3 text-center">
							<p className="text-destructive font-medium">Failed to connect to the database</p>
							<p className="text-muted-foreground text-sm max-w-sm">
								{(error as { message?: string })?.message ?? "An unexpected error occurred"}
							</p>
						</div>
					) : (
						<Outlet />
					)}
				</NuqsAdapter>
				<Toaster position="top-right" />
				{/* Global overlays */}
				<CommandPalette />
				<TableBuilderOverlay />
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
			</>
		);
	},
});
