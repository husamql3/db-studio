"use client";

import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { CHAT_SUGGESTIONS, DEFAULTS } from "shared/constants";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { LoadingText } from "@/components/ai-elements/loading-text";
import {
	Message,
	MessageBranch,
	MessageBranchContent,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { cn } from "@/lib/utils";
import { useSheetStore } from "@/stores/sheet.store";

export const Chat = () => {
	const { rateLimit, refetchRateLimit } = useRateLimit();

	const [text, setText] = useState("");

	const { isSheetOpen, closeSheet, openSheet } = useSheetStore();

	const { messages, sendMessage, isLoading, clear, stop } = useChat({
		connection: fetchServerSentEvents(`${DEFAULTS.BASE_URL}/chat`),
		onError: (error) => console.error("Error:", error.message),
		onResponse: (response) => console.log("Response:", response),
		onFinish: (message) => {
			console.log("Finish:", message);
			refetchRateLimit();
		},
	});

	const handleSubmit = (message: PromptInputMessage) => {
		const hasText = Boolean(message.text);
		const hasAttachments = Boolean(message.files?.length);

		if (!(hasText || hasAttachments) || isLoading) {
			return;
		}

		sendMessage(message.text);
		setText("");
	};

	const handleNewChat = () => {
		clear();
		setText("");
	};

	const handleSuggestionClick = (suggestion: string) => {
		sendMessage(suggestion);
		setText("");
	};

	const handleStop = () => {
		stop();
		setText("");
	};

	const status = isLoading ? "streaming" : "ready";

	const getIndicatorColor = (isLoading: boolean, remaining: number) => {
		if (isLoading) return "bg-blue-500";
		if (!rateLimit) return "bg-zinc-500";
		if (remaining === 0) return "bg-red-500";
		if (remaining <= 5) return "bg-yellow-500";
		return "bg-emerald-500";
	};

	const indicatorColor = getIndicatorColor(
		isLoading,
		rateLimit?.remaining ?? 0,
	);

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
								isLoading ? "animate-pulse" : "",
								indicatorColor,
							)}
						/>
					</Button>
				</TooltipTrigger>
				<TooltipContent
					side="bottom"
					className="text-xs"
				>
					{isLoading ? (
						<p>Generating response...</p>
					) : rateLimit ? (
						<p>
							{rateLimit.remaining}/{rateLimit.limit} messages remaining
						</p>
					) : (
						<p>AI Assistant</p>
					)}
				</TooltipContent>
			</Tooltip>

			<SheetSidebar
				title="AI Assistant"
				cta={
					<div className="flex items-center gap-2">
						{rateLimit && (
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="text-xs px-2 py-1 cursor-default text-muted-foreground">
										{rateLimit.remaining}/{rateLimit.limit}
									</span>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<p>{rateLimit.remaining} messages remaining</p>
								</TooltipContent>
							</Tooltip>
						)}

						<Button
							type="button"
							variant="outline"
							size="lg"
							onClick={handleNewChat}
							disabled={isLoading}
						>
							<Plus className="h-4 w-4 mr-1" />
							New Chat
						</Button>
					</div>
				}
				closeButton={false}
				open={isSheetOpen("ai-assistant")}
				size="max-w-2xl!"
				contentClassName="p-0 flex flex-col h-[calc(100vh-4rem)] flex-1"
				onOpenChange={(open) => {
					if (!open) {
						closeSheet("ai-assistant");
					}
				}}
			>
				<div className="relative flex size-full flex-col divide-y overflow-hidden">
					<Conversation>
						<ConversationContent>
							{messages.length === 0 ? (
								<div className="flex items-center justify-center h-full text-muted-foreground">
									<div className="text-center space-y-2">
										<p className="text-lg font-medium">
											Start a new conversation
										</p>
										<p className="text-sm">Ask me anything to get started</p>
									</div>
								</div>
							) : (
								<>
									{messages.map((message) => {
										const thinkingParts = message.parts.filter(
											(part) => part.type === "thinking",
										);
										const textContent = message.parts
											.filter((part) => part.type === "text")
											.map((part) => part.content)
											.join("");

										const hasThinking = thinkingParts.length > 0;

										return (
											<MessageBranch
												defaultBranch={0}
												key={message.id}
											>
												<MessageBranchContent>
													<Message
														from={
															message.role === "user" ? "user" : "assistant"
														}
													>
														<div>
															{hasThinking && message.role === "assistant" && (
																<Reasoning duration={0}>
																	<ReasoningTrigger />
																	<ReasoningContent>
																		{thinkingParts
																			.map((part) => part.content)
																			.join("\n")}
																	</ReasoningContent>
																</Reasoning>
															)}
															<MessageContent>
																<MessageResponse>{textContent}</MessageResponse>
															</MessageContent>
														</div>
													</Message>
												</MessageBranchContent>
											</MessageBranch>
										);
									})}

									{isLoading && (
										<MessageBranch defaultBranch={0}>
											<MessageBranchContent>
												<Message from="assistant">
													<MessageContent>
														<LoadingText>Thinking...</LoadingText>
													</MessageContent>
												</Message>
											</MessageBranchContent>
										</MessageBranch>
									)}
								</>
							)}
						</ConversationContent>
						<ConversationScrollButton />
					</Conversation>

					<div className="grid shrink-0 gap-4 pt-3">
						{messages.length === 0 && (
							<Suggestions className="px-4">
								{CHAT_SUGGESTIONS.map((suggestion) => (
									<Suggestion
										key={suggestion}
										onClick={() => handleSuggestionClick(suggestion)}
										suggestion={suggestion}
										size="lg"
									>
										{suggestion}
									</Suggestion>
								))}
							</Suggestions>
						)}

						<div className="w-full px-4 pb-4">
							<PromptInput
								globalDrop
								multiple
								onSubmit={handleSubmit}
							>
								<PromptInputBody>
									<PromptInputTextarea
										onChange={(event) => setText(event.target.value)}
										value={text}
										placeholder="Type a message..."
									/>
								</PromptInputBody>

								<PromptInputFooter>
									<PromptInputSubmit
										className="h-8!"
										status={status}
										onClick={isLoading ? handleStop : undefined}
										disabled={rateLimit && rateLimit.remaining === 0}
									/>
								</PromptInputFooter>
							</PromptInput>
						</div>
					</div>
				</div>
			</SheetSidebar>
		</>
	);
};
