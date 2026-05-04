"use client";

import type { ComponentProps, HTMLAttributes, ReactElement } from "react";
import { createContext, memo, useContext, useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

type MessageRole = "system" | "user" | "assistant" | "data";

type MessageProps = HTMLAttributes<HTMLDivElement> & {
	from: MessageRole;
};

export const Message = ({ className, from, ...props }: MessageProps) => (
	<div
		className={cn(
			"group flex w-full max-w-[95%] flex-col gap-2",
			from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
			className,
		)}
		{...props}
	/>
);

type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({ children, className, ...props }: MessageContentProps) => (
	<div
		className={cn(
			"is-user:dark flex w-fit max-w-full min-w-0 flex-col gap-2 overflow-hidden text-sm",
			"group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
			"group-[.is-assistant]:text-foreground",
			className,
		)}
		{...props}
	>
		{children}
	</div>
);

type MessageBranchContextType = {
	currentBranch: number;
	totalBranches: number;
	goToPrevious: () => void;
	goToNext: () => void;
	branches: ReactElement[];
	setBranches: (branches: ReactElement[]) => void;
};

const MessageBranchContext = createContext<MessageBranchContextType | null>(null);

const useMessageBranch = () => {
	const context = useContext(MessageBranchContext);

	if (!context) {
		throw new Error("MessageBranch components must be used within MessageBranch");
	}

	return context;
};

type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
	defaultBranch?: number;
	onBranchChange?: (branchIndex: number) => void;
};

export const MessageBranch = ({
	defaultBranch = 0,
	onBranchChange,
	className,
	...props
}: MessageBranchProps) => {
	const [currentBranch, setCurrentBranch] = useState(defaultBranch);
	const [branches, setBranches] = useState<ReactElement[]>([]);

	const handleBranchChange = (newBranch: number) => {
		setCurrentBranch(newBranch);
		onBranchChange?.(newBranch);
	};

	const goToPrevious = () => {
		const newBranch = currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
		handleBranchChange(newBranch);
	};

	const goToNext = () => {
		const newBranch = currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
		handleBranchChange(newBranch);
	};

	const contextValue: MessageBranchContextType = {
		currentBranch,
		totalBranches: branches.length,
		goToPrevious,
		goToNext,
		branches,
		setBranches,
	};

	return (
		<MessageBranchContext.Provider value={contextValue}>
			<div
				className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
				{...props}
			/>
		</MessageBranchContext.Provider>
	);
};

type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageBranchContent = ({ children, ...props }: MessageBranchContentProps) => {
	const { currentBranch, setBranches, branches } = useMessageBranch();
	const childrenArray = Array.isArray(children) ? children : [children];

	// Use useEffect to update branches when they change
	useEffect(() => {
		if (branches.length !== childrenArray.length) {
			setBranches(childrenArray);
		}
	}, [childrenArray, branches, setBranches]);

	return childrenArray.map((branch, index) => (
		<div
			className={cn(
				"grid gap-2 overflow-hidden [&>div]:pb-0",
				index === currentBranch ? "block" : "hidden",
			)}
			key={branch.key}
			{...props}
		>
			{branch}
		</div>
	));
};

type MessageResponseProps = ComponentProps<typeof Streamdown>;

export const MessageResponse = memo(
	({ className, ...props }: MessageResponseProps) => (
		<Streamdown
			className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
			{...props}
		/>
	),
	(prevProps, nextProps) => prevProps.children === nextProps.children,
);

MessageResponse.displayName = "MessageResponse";
