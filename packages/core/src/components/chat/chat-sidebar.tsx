"use client";

import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { getDbType } from "@/lib/api";
import { useAiPrefillStore } from "@/stores/ai-prefill.store";
import { useAiSettingsStore } from "@/stores/ai-settings.store";
import { useDatabaseStore } from "@/stores/database.store";
import { useInsertSqlStore } from "@/stores/insert-sql.store";
import { useSheetStore } from "@/stores/sheet.store";

export const ChatSidebar = () => {
	const { rateLimit, refetchRateLimit } = useRateLimit();
	const [text, setText] = useState("");
	const { isSheetOpen, closeSheet } = useSheetStore();
	const { selectedDatabase } = useDatabaseStore();
	const {
		includeSchemaInAiContext,
		useByocProxy,
		byocProxyUrl,
	} = useAiSettingsStore();

	const chatUrl = useMemo(() => {
		const dbType = getDbType() ?? "pg";
		return `${DEFAULTS.BASE_URL}/${dbType}/chat`;
	}, []);

	const chatBody = useMemo(() => {
		const body: Record<string, string | boolean | undefined> = {
			db: selectedDatabase ?? undefined,
			includeSchemaInAiContext,
		};
		if (useByocProxy && byocProxyUrl?.trim()) {
			body.proxyUrl = byocProxyUrl.trim();
		}
		return body;
	}, [selectedDatabase, includeSchemaInAiContext, useByocProxy, byocProxyUrl]);

	const { prefillMessage, setPrefillMessage } = useAiPrefillStore();
	const { setPendingSql } = useInsertSqlStore();

	function extractSqlBlock(text: string): string | null {
		const match = text.match(/```sql\s*([\s\S]*?)```/);
		return match ? match[1].trim() : null;
	}

	useEffect(() => {
		if (isSheetOpen("ai-assistant") && prefillMessage) {
			setText(prefillMessage);
			setPrefillMessage(null);
		}
	}, [isSheetOpen("ai-assistant"), prefillMessage, setPrefillMessage]);

	const { messages, sendMessage, isLoading, clear, stop } = useChat({
		connection: fetchServerSentEvents(chatUrl, { body: chatBody }),
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
									<p className="text-lg font-medium">Start a new conversation</p>
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
										.map((part) =>
											"content" in part ? part.content : "",
										)
										.join("");

									const hasThinking = thinkingParts.length > 0;
									const sqlBlock =
										message.role === "assistant"
											? extractSqlBlock(textContent)
											: null;

									return (
										<MessageBranch
											defaultBranch={0}
											key={message.id}
										>
											<MessageBranchContent>
												<Message from={message.role === "user" ? "user" : "assistant"}>
													<div className="space-y-2">
														{hasThinking && message.role === "assistant" && (
															<Reasoning duration={0}>
																<ReasoningTrigger />
																<ReasoningContent>
																	{thinkingParts
																		.map((part) =>
																			"content" in part
																				? part.content
																				: "",
																		)
																		.join("\n")}
																</ReasoningContent>
															</Reasoning>
														)}
														<MessageContent>
															<MessageResponse>{textContent}</MessageResponse>
														</MessageContent>
														{sqlBlock && (
															<Button
																type="button"
																variant="outline"
																size="sm"
																className="mt-2"
																onClick={() => setPendingSql(sqlBlock)}
															>
																Insert into editor
															</Button>
														)}
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
									disabled={
										(rateLimit?.remaining === 0) || !selectedDatabase
									}
								/>
							</PromptInputFooter>
						</PromptInput>
					</div>
				</div>
			</div>
		</SheetSidebar>
	);
};
