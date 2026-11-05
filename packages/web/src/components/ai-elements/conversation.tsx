import { Button } from "@db-studio/ui/button";
import { cn } from "@db-studio/ui/utils";
import { ArrowDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
	<StickToBottom
		className={cn("relative flex-1 overflow-y-hidden", className)}
		initial="smooth"
		resize="smooth"
		role="log"
		{...props}
	/>
);

type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

export const ConversationContent = ({ className, ...props }: ConversationContentProps) => (
	<StickToBottom.Content
		className={cn("flex flex-col gap-8 p-4", className)}
		{...props}
	/>
);

type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
	className,
	...props
}: ConversationScrollButtonProps) => {
	const { isAtBottom, scrollToBottom } = useStickToBottomContext();

	const handleScrollToBottom = useCallback(() => {
		scrollToBottom();
	}, [scrollToBottom]);

	return (
		!isAtBottom && (
			<Button
				className={cn(
					"absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full",
					className,
				)}
				onClick={handleScrollToBottom}
				size="icon"
				type="button"
				variant="outline"
				{...props}
			>
				<ArrowDownIcon className="size-4" />
			</Button>
		)
	);
};
