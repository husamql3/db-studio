import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ConnectUrlForm } from "../components/connect-url-form";
import { SavedConnectionsTable } from "../components/saved-connections-table";
import { useConnections } from "../hooks/use-connections";

/** The first page without a connection, and where every connection is managed. */
export const ConnectScreen = () => {
	const { active, connections } = useConnections();
	const activeName = connections.find((c) => c.id === active?.id)?.name;

	return (
		<div className="flex h-dvh flex-col bg-background text-foreground">
			<header className="flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs">
				<img
					src="/favicon.png"
					alt=""
					className="size-4"
				/>
				<span className="font-medium">DB Studio</span>
				<span className="text-muted-foreground">v{import.meta.env.VITE_APP_VERSION}</span>
				{active && (
					<Link
						to="/"
						className="ml-auto flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
					>
						<ArrowLeft className="size-3.5" />
						Back to {activeName ?? "the open connection"}
					</Link>
				)}
			</header>
			<main className="flex-1 overflow-auto">
				<div className="mx-auto w-full max-w-3xl space-y-8 px-6 pb-16 pt-[10vh]">
					<div className="space-y-3">
						<div className="space-y-1">
							<h1 className="text-sm font-semibold">Connect a database</h1>
							<p className="text-xs text-muted-foreground">
								Paste a connection URL, or pick one you used before.
							</p>
						</div>
						<ConnectUrlForm />
					</div>
					<SavedConnectionsTable />
				</div>
			</main>
		</div>
	);
};
