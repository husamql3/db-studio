"use client";

import { Button } from "@db-studio/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { cn } from "@db-studio/ui/utils";
import { useByok } from "@tanstack/ai-react";
import { Sparkles } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { aiByok, useAiByokReady, useAiSettingsStore } from "@/features/settings";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { posthogAnalytics } from "@/lib/posthog";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";

// The chat, its markdown renderer and its model client are a large share of the app's code, so
// they load when the assistant first opens instead of with every page.
const loadChatSidebar = () => import("@/components/chat/chat-sidebar");
const ChatSidebar = lazy(() =>
	loadChatSidebar().then((module) => ({ default: module.ChatSidebar })),
);

export const Chat = () => {
	const { openOverlay, isOverlayOpen } = useOverlayStore();
	// Once opened, the assistant stays mounted so it can animate closed and keep the conversation.
	const [assistantMounted, setAssistantMounted] = useState(false);
	if (isOverlayOpen("chat.assistant") && !assistantMounted) setAssistantMounted(true);
	const { dbType } = useDatabaseStore();
	const { provider } = useAiSettingsStore();
	const byok = useByok(aiByok);
	const isByokReady = useAiByokReady();
	const keyStatus = byok.status[provider];
	const hasPersonalKey = keyStatus?.state === "set" || keyStatus?.state === "locked";
	const { rateLimit, isLoadingRateLimit, errorRateLimit } = useRateLimit({
		enabled: isByokReady && provider === "gemini" && !hasPersonalKey,
	});
	const { remaining = 0, limit = 0 } = rateLimit ?? { remaining: 0, limit: 0 };

	const getIndicatorColor = () => {
		if (hasPersonalKey) return "bg-emerald-500";
		if (isLoadingRateLimit || errorRateLimit) return "bg-zinc-500";
		if (provider !== "gemini") return "bg-red-500";
		if (remaining === 0) return "bg-red-500";
		if (remaining <= 5) return "bg-yellow-500";
		return "bg-emerald-500";
	};

	const indicatorColor = getIndicatorColor();

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						className="border-r-0 border-y-0 border-l border-border rounded-none h-full w-12 relative text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
						aria-label="Open AI assistant"
						onPointerEnter={loadChatSidebar}
						onFocus={loadChatSidebar}
						onClick={() => {
							openOverlay("chat.assistant");
							if (dbType) posthogAnalytics.capture("chat_opened", { db_type: dbType });
						}}
					>
						<Sparkles className="size-5" />
						<span
							data-testid="chat-status-indicator"
							className={cn(
								"absolute top-2 right-2 h-2 w-2 rounded-full ring-2 ring-background",
								indicatorColor,
							)}
						/>
					</Button>
				</TooltipTrigger>
				<TooltipContent
					side="bottom"
					className="text-xs"
				>
					{hasPersonalKey ? (
						<p>AI Assistant · personal {provider} key</p>
					) : !isLoadingRateLimit && !errorRateLimit ? (
						remaining > 0 ? (
							<p>
								{remaining}/{limit} messages remaining
							</p>
						) : (
							<p>AI Assistant</p>
						)
					) : (
						<p>AI status unavailable</p>
					)}
				</TooltipContent>
			</Tooltip>

			{assistantMounted && (
				<Suspense>
					<ChatSidebar />
				</Suspense>
			)}
		</>
	);
};
