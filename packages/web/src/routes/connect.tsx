import { createFileRoute } from "@tanstack/react-router";
import { ConnectScreen } from "@/features/connections";

export const Route = createFileRoute("/connect")({
	component: ConnectScreen,
});
