import { aiDevtoolsPlugin } from "@tanstack/react-ai-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { NuqsAdapter } from "nuqs/adapters/react";
import { AddTableForm } from "@/components/add-table/add-table-form";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentDatabase } from "@/hooks/use-databases-list";
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

		// Wait for the current database to be loaded before rendering the outlet
		const { isLoadingCurrentDatabase } = useCurrentDatabase();

		return (
			<>
				<script src={`data:text/javascript;base64,${btoa(darkModeScript)}`} />

				<NuqsAdapter
					fullPageNavigationOnShallowFalseUpdates
					defaultOptions={{ shallow: true, clearOnDefault: true }}
				>
					{isLoadingCurrentDatabase ? (
						<div className="flex items-center justify-center h-screen">
							<Spinner
								size="size-5"
								color="text-primary"
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
