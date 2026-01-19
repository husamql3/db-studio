import { aiDevtoolsPlugin } from "@tanstack/react-ai-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { NuqsAdapter } from "nuqs/adapters/react";
import { AddTableForm } from "@/components/add-table/add-table-form";
import { Toaster } from "@/components/ui/sonner";
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

		return (
			<>
				<script src={`data:text/javascript;base64,${btoa(darkModeScript)}`} />

				<NuqsAdapter
					fullPageNavigationOnShallowFalseUpdates
					defaultOptions={{ shallow: true, clearOnDefault: true }}
				>
					<Outlet />
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
