import { Toaster } from "@db-studio/ui/sonner";
import { Spinner } from "@db-studio/ui/spinner";
import { aiDevtoolsPlugin } from "@tanstack/react-ai-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { NuqsAdapter } from "nuqs/adapters/react";
import { AddTableForm } from "@/components/add-table/add-table-form";
import { useInitializeDatabase } from "@/hooks/use-databases-list";
import { useTheme } from "@/hooks/use-theme";

const darkModeScript = String.raw`
  try {
    document.documentElement.classList.add('dark')
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#09090b')
  } catch (_) {}

  try {
    if (/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)) {
      document.documentElement.classList.add('os-macos')
    }
  } catch (_) {}
`;

const connectDevtoolsServerBus =
	import.meta.env.DEV && import.meta.env.VITE_TANSTACK_SERVER_BUS === "true";

export const Route = createRootRoute({
	component: function RootRouteComponent() {
		useTheme();

		// Initialize database connection when the component mounts, fetches databases list, current db, and selects first db as fallback
		const { isLoading, isInitialized, error } = useInitializeDatabase();

		// Show loading until both queries complete AND database is initialized in store
		const showLoading = (isLoading || !isInitialized) && !error;

		return (
			<>
				<script src={`data:text/javascript;base64,${btoa(darkModeScript)}`} />

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
				{/* Global sheets */}
				<AddTableForm />
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
