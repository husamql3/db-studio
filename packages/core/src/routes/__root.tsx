import { aiDevtoolsPlugin } from "@tanstack/react-ai-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { NuqsAdapter } from "nuqs/adapters/react";
import { AddTableForm } from "@/components/add-table/add-table-form";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { useInitializeDatabase } from "@/hooks/use-databases-list";
import { useTheme } from "@/hooks/use-theme";

const darkModeScript = String.raw`
  try {
    if (localStorage.theme === 'dark' || ((!('theme' in localStorage) || localStorage.theme === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.querySelector('meta[name="theme-color"]').setAttribute('content', '#09090b')
    }
  } catch (_) {}

  try {
    if (/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)) {
      document.documentElement.classList.add('os-macos')
    }
  } catch (_) {}
`;

export const Route = createRootRoute({
	component: function RootRouteComponent() {
		useTheme();

		// Initialize database connection when the component mounts, fetches databases list, current db, and selects first db as fallback
		const { isLoading, isInitialized } = useInitializeDatabase();

		// Show loading until both queries complete AND database is initialized in store
		const showLoading = isLoading || !isInitialized;

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
						connectToServerBus: true,
					}}
				/>
			</>
		);
	},
});
