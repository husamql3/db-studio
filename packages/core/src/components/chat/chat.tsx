"use client";

import { Sparkles } from "lucide-react";
import { lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { cn } from "@/lib/utils";
import { useSheetStore } from "@/stores/sheet.store";

const ChatSidebar = lazy(() =>
	import("@/components/chat/chat-sidebar").then((module) => ({
		default: module.ChatSidebar,
	})),
);

export const Chat = () => {
	const { isSheetOpen, openSheet } = useSheetStore();
	const { rateLimit, isLoadingRateLimit } = useRateLimit();
	const { remaining = 0, limit = 0 } = rateLimit ?? { remaining: 0, limit: 0 };

	const getIndicatorColor = (remaining: number) => {
		if (remaining === 0) return "bg-red-500";
		if (remaining <= 5) return "bg-yellow-500";
		return "bg-emerald-500";
	};

	const indicatorColor = getIndicatorColor(remaining);

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						className="border-r-0 border-y-0 border-l border-zinc-800 rounded-none h-full w-12 relative"
						onClick={() => openSheet("ai-assistant")}
					>
						<Sparkles className="size-5" />
						<span
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
					{!isLoadingRateLimit &&
						(remaining > 0 ? (
							<p>
								{remaining}/{limit} messages remaining
							</p>
						) : (
							<p>AI Assistant</p>
						))}
				</TooltipContent>
			</Tooltip>

			{isSheetOpen("ai-assistant") && (
				<Suspense fallback={null}>
					<ChatSidebar />
				</Suspense>
			)}
		</>
	);
};
