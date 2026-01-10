import { TanStackDevtools } from "@tanstack/react-devtools";
import { aiDevtoolsPlugin } from '@tanstack/react-ai-devtools'
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { NuqsAdapter } from "nuqs/adapters/react";
import { Toaster } from "@/components/ui/sonner";
import { useTheme } from "@/hooks/use-theme";
import { AddTableForm } from "@/components/add-table/add-table-form";
import { Chat } from "@/components/chat/chat";

export const Route = createRootRoute({
	component: function RootRouteComponent() {
		useTheme();

		return (
			<>
				<NuqsAdapter
					fullPageNavigationOnShallowFalseUpdates
					defaultOptions={{ shallow: true, clearOnDefault: true }}
				>
					<Outlet />
				</NuqsAdapter>
				<Toaster position="top-right" />
				{/* Global sheets */}
				<AddTableForm />
				<Chat />
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
