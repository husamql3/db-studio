"use client";

import { Button } from "@db-studio/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { cn } from "@db-studio/ui/utils";
import { useByok } from "@tanstack/ai-react";
import { Sparkles } from "lucide-react";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { aiByok, useAiByokReady, useAiSettingsStore } from "@/features/settings";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { posthogAnalytics } from "@/lib/posthog";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";

export const Chat = () => {
	const { openOverlay } = useOverlayStore();
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

			<ChatSidebar />
		</>
	);
};
