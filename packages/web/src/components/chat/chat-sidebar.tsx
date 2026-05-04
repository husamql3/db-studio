"use client";

import { CHAT_SUGGESTIONS, DEFAULTS } from "@db-studio/shared/constants";
import { Button } from "@db-studio/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { useRateLimit } from "@/hooks/use-rate-limit";
import { useDatabaseStore } from "@/stores/database.store";
import { useSheetStore } from "@/stores/sheet.store";

interface ChatController {
	clear: () => void;
	isLoading: boolean;
}

interface ChatSidebarContentProps {
	db: string;
	onRateLimitRefetch: () => void;
	onControllerReady: (controller: ChatController) => void;
}

// `useChat` captures `body` only at initial mount (via useMemo([clientId])).
// Keying this inner component on `db` forces a remount when the database
// changes, so the ChatClient is rebuilt with a fresh body.
const ChatSidebarContent = ({
	db,
	onRateLimitRefetch,
	onControllerReady,
}: ChatSidebarContentProps) => {
	const [text, setText] = useState("");
	const { rateLimit } = useRateLimit();
	const { remaining } = rateLimit ?? { remaining: 0, limit: 0 };

	const { messages, sendMessage, isLoading, clear, stop } = useChat({
		connection: fetchServerSentEvents(`${DEFAULTS.BASE_URL}/chat`),
		body: { db },
		onError: (error) => console.error("Error:", error.message),
		onFinish: () => {
			onRateLimitRefetch();
		},
	});

	useEffect(() => {
		onControllerReady({
			clear: () => {
				clear();
				setText("");
			},
			isLoading,
		});
	}, [clear, isLoading, onControllerReady]);

	const handleSubmit = (message: PromptInputMessage) => {
		const hasText = Boolean(message.text);
		const hasAttachments = Boolean(message.files?.length);

		if (!(hasText || hasAttachments) || isLoading) {
			return;
		}

		sendMessage(message.text);
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

	return (
		<div className="relative flex size-full flex-col divide-y overflow-hidden">
			<Conversation>
				<ConversationContent>
					{messages.length === 0 ? (
						<div className="flex items-center justify-center h-full text-muted-foreground">
							<div className="text-center space-y-2">
								<p className="text-lg font-medium">Start a new conversation</p>
								<p className="text-sm">Ask me anything to get started</p>
							</div>
						</div>
					) : (
						<>
							{messages.map((message) => {
								const thinkingParts = message.parts.filter((part) => part.type === "thinking");
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
											<Message from={message.role === "user" ? "user" : "assistant"}>
												<div>
													{hasThinking && message.role === "assistant" && (
														<Reasoning duration={0}>
															<ReasoningTrigger />
															<ReasoningContent>
																{thinkingParts.map((part) => part.content).join("\n")}
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
				{messages.length === 0 && remaining > 0 && (
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
	);
};

export const ChatSidebar = () => {
	const { rateLimit, refetchRateLimit } = useRateLimit();
	const { isSheetOpen, closeSheet } = useSheetStore();
	const { selectedDatabase } = useDatabaseStore();
	const [controller, setController] = useState<ChatController | null>(null);
	const controllerSetterRef = useRef((next: ChatController) => setController(next));

	return (
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

					{selectedDatabase && controller && (
						<Button
							type="button"
							variant="outline"
							size="lg"
							onClick={controller.clear}
							disabled={controller.isLoading}
						>
							<Plus className="h-4 w-4 mr-1" />
							New Chat
						</Button>
					)}
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
			{selectedDatabase ? (
				<ChatSidebarContent
					key={selectedDatabase}
					db={selectedDatabase}
					onRateLimitRefetch={refetchRateLimit}
					onControllerReady={controllerSetterRef.current}
				/>
			) : (
				<div className="flex items-center justify-center h-full text-muted-foreground p-8">
					<div className="text-center space-y-2">
						<p className="text-lg font-medium">No database selected</p>
						<p className="text-sm">Select a database from the sidebar to start chatting.</p>
					</div>
				</div>
			)}
		</SheetSidebar>
	);
};
