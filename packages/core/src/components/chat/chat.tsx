import { IconSparkles } from "@tabler/icons-react";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { Plus } from "lucide-react";
import { useState } from "react";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
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
import { SheetSidebar } from "@/components/sheet-sidebar";
import { Button } from "@/components/ui/button";
import { useSheetStore } from "@/stores/sheet.store";
import { API_URL } from "@/utils/constants";
import { LoadingText } from "../ai-elements/loading-text";
import { Suggestion, Suggestions } from "../ai-elements/suggestion";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

// todo: implement suggestions
const SUGGESTIONS = [
	"What are the latest trends in AI?",
	"How does machine learning work?",
	"Explain quantum computing",
	"Best practices for React development",
	"Tell me about TypeScript benefits",
	"How to optimize database queries?",
	"What is the difference between SQL and NoSQL?",
	"Explain cloud computing basics",
];

export const Chat = () => {
	const { isSheetOpen, closeSheet, openSheet } = useSheetStore();
	const [text, setText] = useState("");

	const { messages, sendMessage, isLoading, clear, stop } = useChat({
		connection: fetchServerSentEvents(`${API_URL}/chat`),
		onError: (error) => console.error("Error:", error.message),
		onResponse: (response) => console.log("Response:", response),
		onFinish: (message) => console.log("Finish:", message),
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

	// Determine status based on loading state
	const status = isLoading ? "streaming" : "ready";

	console.log(status, messages);

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						className="border-r-0 border-y-0 border-l border-zinc-800 rounded-none h-full w-12"
						onClick={() => openSheet("ai-assistant")}
					>
						<IconSparkles className="size-5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<p>AI Assistant</p>
				</TooltipContent>
			</Tooltip>

			<SheetSidebar
				title="AI Assistant"
				cta={
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
										// Extract thinking parts if any
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
						{messages.length === 0 && (
							<Suggestions className="px-4">
								{SUGGESTIONS.map((suggestion) => (
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
										// disabled={!text.trim()}
										status={status}
										onClick={isLoading ? handleStop : undefined}
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
