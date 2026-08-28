import { createFileRoute } from "@tanstack/react-router";
import { RedisBrowserScreen } from "@/features/redis-browser";

export const Route = createFileRoute("/_pathlessLayout/browser")({
	component: RedisBrowserScreen,
});
