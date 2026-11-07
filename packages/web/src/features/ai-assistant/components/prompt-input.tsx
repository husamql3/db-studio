import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@db-studio/ui/input-group";
import { cn } from "@db-studio/ui/utils";
import { CornerDownLeftIcon, Loader2Icon, SquareIcon, XIcon } from "lucide-react";
import {
	type ComponentProps,
	type FormEventHandler,
	type HTMLAttributes,
	type KeyboardEventHandler,
	useState,
} from "react";

type ChatStatus = "submitted" | "streaming" | "ready" | "error";

type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, "onSubmit"> & {
	onSubmit: (text: string) => void;
};

export const PromptInput = ({ className, onSubmit, children, ...props }: PromptInputProps) => {
	const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
		event.preventDefault();
		const message = new FormData(event.currentTarget).get("message");
		onSubmit(typeof message === "string" ? message : "");
	};

	return (
		<form
			className={cn("w-full", className)}
			onSubmit={handleSubmit}
			{...props}
		>
			<InputGroup className="overflow-hidden">{children}</InputGroup>
		</form>
	);
};

type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputBody = ({ className, ...props }: PromptInputBodyProps) => (
	<div
		className={cn("contents", className)}
		{...props}
	/>
);

type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;

export const PromptInputTextarea = ({
	className,
	placeholder = "What would you like to know?",
	...props
}: PromptInputTextareaProps) => {
	const [isComposing, setIsComposing] = useState(false);

	const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
		if (e.key !== "Enter" || e.shiftKey || isComposing || e.nativeEvent.isComposing) return;

		e.preventDefault();

		const form = e.currentTarget.form;
		const submitButton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');

		if (submitButton?.disabled) return;

		form?.requestSubmit();
	};

	return (
		<InputGroupTextarea
			className={cn("field-sizing-content max-h-48 min-h-16", className)}
			name="message"
			onCompositionEnd={() => setIsComposing(false)}
			onCompositionStart={() => setIsComposing(true)}
			onKeyDown={handleKeyDown}
			placeholder={placeholder}
			{...props}
		/>
	);
};

type PromptInputFooterProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export const PromptInputFooter = ({ className, ...props }: PromptInputFooterProps) => (
	<InputGroupAddon
		align="block-end"
		className={cn("justify-between justify-end gap-1", className)}
		{...props}
	/>
);

type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
	status?: ChatStatus;
};

export const PromptInputSubmit = ({
	className,
	variant = "default",
	size = "icon-sm",
	status,
	children,
	...props
}: PromptInputSubmitProps) => {
	let Icon = <CornerDownLeftIcon className="size-4" />;

	if (status === "submitted") {
		Icon = <Loader2Icon className="size-4 animate-spin" />;
	} else if (status === "streaming") {
		Icon = <SquareIcon className="size-4" />;
	} else if (status === "error") {
		Icon = <XIcon className="size-4" />;
	}

	return (
		<InputGroupButton
			aria-label="Submit"
			className={cn(className)}
			size={size}
			type="submit"
			variant={variant}
			{...props}
		>
			{children ?? Icon}
		</InputGroupButton>
	);
};
