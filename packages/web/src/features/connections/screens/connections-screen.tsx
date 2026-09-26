import { META } from "@db-studio/shared/constants";
import type { SavedConnectionSchemaType } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import { Spinner } from "@db-studio/ui/spinner";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Database } from "lucide-react";
import { useState } from "react";
import { DesktopTitleBar } from "@/components/desktop-title-bar";
import { desktop } from "@/lib/desktop";
import { ConnectionForm } from "../components/connection-form";
import { ConnectionListItem } from "../components/connection-list-item";
import { useDesktopConnections, useDesktopServer } from "../hooks/use-desktop-connections";

export const ConnectionsScreen = () => {
	const navigate = useNavigate();
	const [editing, setEditing] = useState<SavedConnectionSchemaType | null>(null);
	const { connections, isLoading, saveConnection, deleteConnection } = useDesktopConnections();
	const { status, connect, disconnect } = useDesktopServer();

	return (
		<div className="flex h-dvh w-dvw flex-col overflow-hidden bg-background text-foreground">
			<DesktopTitleBar />

			<main className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-5xl space-y-8 p-8">
					<header className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Database className="size-4 text-muted-foreground" />
							<h1 className="text-base font-semibold">{META.SITE_TITLE}</h1>
							<span className="text-xs text-muted-foreground">v{desktop?.version}</span>
						</div>
						{status.state === "running" && (
							<Button
								size="sm"
								variant="outline"
								onClick={() => navigate({ to: "/" })}
							>
								Open workspace
								<ArrowRight className="size-3.5" />
							</Button>
						)}
					</header>

					<div className="grid gap-8 md:grid-cols-[1.2fr_1fr]">
						<section className="space-y-3">
							<div className="space-y-1">
								<h2 className="text-sm font-semibold">Connections</h2>
								<p className="text-xs text-muted-foreground">
									Connection URLs are encrypted with your operating system keychain and never
									leave this device.
								</p>
							</div>
							{isLoading ? (
								<div className="flex justify-center py-10">
									<Spinner />
								</div>
							) : connections.length === 0 ? (
								<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
									No saved connections yet. Add one on the right or import a{" "}
									<code className="font-mono">.env</code> file.
								</div>
							) : (
								<ul className="space-y-2">
									{connections.map((connection) => (
										<ConnectionListItem
											key={connection.id}
											connection={connection}
											status={status}
											onConnect={() =>
												connect(connection.id, connection.name).catch(() => undefined)
											}
											onDisconnect={() => disconnect().catch(() => undefined)}
											onEdit={() => setEditing(connection)}
											onDelete={() =>
												deleteConnection(connection.id, connection.name).catch(() => undefined)
											}
										/>
									))}
								</ul>
							)}
						</section>

						<section>
							<ConnectionForm
								key={editing?.id ?? "new"}
								editing={editing}
								onCancel={() => setEditing(null)}
								onSubmit={async (input) => {
									await saveConnection(input);
									setEditing(null);
								}}
							/>
						</section>
					</div>
				</div>
			</main>
		</div>
	);
};
