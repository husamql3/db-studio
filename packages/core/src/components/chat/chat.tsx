import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSheetStore } from "@/stores/sheet.store";
import { cn } from "@/lib/utils";

export const Chat = () => {
  const { isSheetOpen, closeSheet } = useSheetStore();
  const [input, setInput] = useState("");

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat/"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput("");
    }
  };

  return (
    <SheetSidebar
      title="AI Assistant"
      open={isSheetOpen("ai-assistant")}
      size="max-w-lg!"
      contentClassName="p-0 flex flex-col h-[calc(100vh-4rem)]"
      onOpenChange={(open) => {
        if (!open) {
          closeSheet("ai-assistant");
        }
      }}
    >
      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              Start a conversation with the AI assistant
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "mb-4",
                message.role === "assistant" ? "text-blue-600 dark:text-blue-400" : "text-foreground"
              )}
            >
              <div className="font-semibold mb-1 text-xs">
                {message.role === "assistant" ? "Assistant" : "You"}
              </div>
              <div className="text-sm space-y-2">
                {message.parts.map((part, idx) => {
                  if (part.type === "thinking") {
                    return (
                      <div
                        key={idx}
                        className="text-xs text-muted-foreground italic mb-2"
                      >
                        💭 Thinking: {part.content}
                      </div>
                    );
                  }
                  if (part.type === "text") {
                    return <div key={idx} className="whitespace-pre-wrap">{part.content}</div>;
                  }
                  return null;
                })}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="text-sm text-muted-foreground italic">
              Thinking...
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={!input.trim() || isLoading}
          >
            Send
          </Button>
        </div>
      </form>
    </SheetSidebar>
  );
};