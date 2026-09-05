"use client";

import { CHAT_SUGGESTIONS, DEFAULTS } from "@db-studio/shared/constants";
import { Button } from "@db-studio/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { fetchServerSentEvents, useByok, useChat } from "@tanstack/ai-react";
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
import { useAssistantRequestStore } from "@/features/ai-assistant";
import { aiByok, useAiByokReady, useAiSettingsStore } from "@/features/settings";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { getBaseUrl } from "@/shared/api/client";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";

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
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const { openOverlay } = useOverlayStore();
	const { pendingPrompt, consumePrompt } = useAssistantRequestStore();
	const { includeSchemaInAiContext, provider, model } = useAiSettingsStore();
	const byok = useByok(aiByok);
	const isByokReady = useAiByokReady();
	const keyStatus = byok.status[provider];
	const hasPersonalKey = keyStatus?.state === "set" || keyStatus?.state === "locked";
	const { rateLimit } = useRateLimit({
		enabled: isByokReady && provider === "gemini" && !hasPersonalKey,
	});
	const { remaining } = rateLimit ?? { remaining: 0, limit: 0 };
	const canSend = hasPersonalKey || (provider === "gemini" && remaining > 0);

	const { messages, sendMessage, isLoading, clear, stop } = useChat({
		connection: fetchServerSentEvents(`${getBaseUrl()}${DEFAULTS.API_PREFIX}/chat`),
		body: { db, includeSchema: includeSchemaInAiContext },
		byok: aiByok,
		forwardedProps: { provider, model },
		onError: (error) => setErrorMessage(error.message),
		onFinish: () => {
			// Only the hosted Gemini path spends the shared quota. React Query's
			// manual `refetch()` runs even while the query is disabled, so refetching
			// unconditionally would hit /chat/limit on every BYOK response too.
			if (provider === "gemini" && !hasPersonalKey) {
				onRateLimitRefetch();
			}
		},
	});

	// Hold a queued prompt until the chat can actually send it. Consuming it while
	// BYOK is still initialising or the quota is exhausted would drop the prompt.
	useEffect(() => {
		if (!pendingPrompt || isLoading || !isByokReady || !canSend) return;
		consumePrompt();
		sendMessage(pendingPrompt);
	}, [canSend, consumePrompt, isByokReady, isLoading, pendingPrompt, sendMessage]);

	useEffect(() => {
		onControllerReady({
			clear: () => {
				clear();
				setText("");
				setErrorMessage(null);
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

		setErrorMessage(null);
		sendMessage(message.text);
		setText("");
	};

	const handleSuggestionClick = (suggestion: string) => {
		setErrorMessage(null);
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
								const textContent = message.parts.reduce<string>(
									(acc, part) => (part.type === "text" ? acc + (part.content ?? "") : acc),
									"",
								);

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
				{errorMessage && (
					<div className="mx-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
						{errorMessage}
					</div>
				)}
				{!canSend && (
					<div className="mx-4 rounded-lg border p-3 text-sm">
						<p className="text-muted-foreground">
							{provider === "gemini"
								? "The hosted AI limit is exhausted. Add a personal Gemini key to continue."
								: `Add a ${provider} API key to use this provider.`}
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="mt-2"
							onClick={() => openOverlay("settings.app")}
						>
							Open settings
						</Button>
					</div>
				)}
				{messages.length === 0 && canSend && (
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
								disabled={!canSend}
							/>
						</PromptInputFooter>
					</PromptInput>
				</div>
			</div>
		</div>
	);
};

export const ChatSidebar = () => {
	const { isOverlayOpen, closeOverlay } = useOverlayStore();
	const { selectedDatabase } = useDatabaseStore();
	const { includeSchemaInAiContext, provider, model } = useAiSettingsStore();
	const byok = useByok(aiByok);
	const isByokReady = useAiByokReady();
	const keyStatus = byok.status[provider];
	const hasPersonalKey = keyStatus?.state === "set" || keyStatus?.state === "locked";
	const { rateLimit, refetchRateLimit } = useRateLimit({
		enabled: isByokReady && provider === "gemini" && !hasPersonalKey,
	});
	const [controller, setController] = useState<ChatController | null>(null);
	const controllerSetterRef = useRef((next: ChatController) => setController(next));

	return (
		<SheetSidebar
			title="AI Assistant"
			cta={
				<div className="flex items-center gap-2">
					{rateLimit && !hasPersonalKey && (
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
							<Plus className="size-4 mr-1" />
							New Chat
						</Button>
					)}
				</div>
			}
			closeButton={false}
			open={isOverlayOpen("chat.assistant")}
			size="max-w-2xl!"
			contentClassName="p-0 flex flex-col h-[calc(100vh-4rem)] flex-1"
			onOpenChange={(open) => {
				if (!open) {
					closeOverlay("chat.assistant");
				}
			}}
		>
			{selectedDatabase ? (
				<ChatSidebarContent
					key={`${selectedDatabase}:${includeSchemaInAiContext}:${provider}:${model}`}
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
