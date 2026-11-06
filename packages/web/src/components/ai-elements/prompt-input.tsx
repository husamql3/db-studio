type ChatStatus = "submitted" | "streaming" | "ready" | "error";

type FileUIPart = {
	type: "file";
	url: string;
	mediaType: string;
	filename?: string;
};

import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@db-studio/ui/input-group";
import { cn } from "@db-studio/ui/utils";
import { CornerDownLeftIcon, Loader2Icon, SquareIcon, XIcon } from "lucide-react";
import { nanoid } from "nanoid";
import {
	type ChangeEvent,
	type ChangeEventHandler,
	type ClipboardEventHandler,
	type ComponentProps,
	createContext,
	type FormEvent,
	type FormEventHandler,
	type HTMLAttributes,
	type KeyboardEventHandler,
	type RefObject,
	use,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

type AttachmentsContext = {
	files: (FileUIPart & { id: string })[];
	add: (files: File[] | FileList) => void;
	remove: (id: string) => void;
	clear: () => void;
	openFileDialog: () => void;
	fileInputRef: RefObject<HTMLInputElement | null>;
};

type TextInputContext = {
	value: string;
	setInput: (v: string) => void;
	clear: () => void;
};

type PromptInputControllerProps = {
	textInput: TextInputContext;
	attachments: AttachmentsContext;
	/** INTERNAL: Allows PromptInput to register its file textInput + "open" callback */
	__registerFileInput: (ref: RefObject<HTMLInputElement | null>, open: () => void) => void;
};

const PromptInputController = createContext<PromptInputControllerProps | null>(null);
const ProviderAttachmentsContext = createContext<AttachmentsContext | null>(null);

// Optional variants (do NOT throw). Useful for dual-mode components.
const useOptionalPromptInputController = () => useContext(PromptInputController);

const useOptionalProviderAttachments = () => useContext(ProviderAttachmentsContext);

const LocalAttachmentsContext = createContext<AttachmentsContext | null>(null);

const usePromptInputAttachments = () => {
	const provider = useOptionalProviderAttachments();
	const local = use(LocalAttachmentsContext);
	const context = provider ?? local;

	if (!context) {
		throw new Error(
			"usePromptInputAttachments must be used within a PromptInput or PromptInputProvider",
		);
	}

	return context;
};

export type PromptInputMessage = {
	text: string;
	files: FileUIPart[];
};

type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, "onSubmit" | "onError"> & {
	accept?: string; // e.g., "image/*" or leave undefined for any
	multiple?: boolean;
	// When true, accepts drops anywhere on document. Default false (opt-in).
	globalDrop?: boolean;
	// Render a hidden input with given name and keep it in sync for native form posts. Default false.
	syncHiddenInput?: boolean;
	maxFiles?: number;
	maxFileSize?: number; // bytes
	onError?: (err: { code: "max_files" | "max_file_size" | "accept"; message: string }) => void;
	onSubmit: (
		message: PromptInputMessage,
		event: FormEvent<HTMLFormElement>,
	) => void | Promise<void>;
};

export const PromptInput = ({
	className,
	accept,
	multiple,
	globalDrop,
	syncHiddenInput,
	maxFiles,
	maxFileSize,
	onError,
	onSubmit,
	children,
	...props
}: PromptInputProps) => {
	const controller = useOptionalPromptInputController();
	const usingProvider = !!controller;

	const inputRef = useRef<HTMLInputElement | null>(null);
	const formRef = useRef<HTMLFormElement | null>(null);

	const [items, setItems] = useState<(FileUIPart & { id: string })[]>([]);
	const files = usingProvider ? controller.attachments.files : items;

	// Keep a ref to files for cleanup on unmount (avoids stale closure)
	const filesRef = useRef(files);
	filesRef.current = files;

	const openFileDialogLocal = useCallback(() => {
		inputRef.current?.click();
	}, []);

	const matchesAccept = useCallback(
		(f: File) => {
			if (!accept || accept.trim() === "") {
				return true;
			}

			const patterns = accept
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);

			return patterns.some((pattern) => {
				if (pattern.endsWith("/*")) {
					const prefix = pattern.slice(0, -1); // e.g: image/* -> image/

					return f.type.startsWith(prefix);
				}

				return f.type === pattern;
			});
		},
		[accept],
	);

	const addLocal = useCallback(
		(fileList: File[] | FileList) => {
			const incoming = Array.from(fileList);
			const accepted = incoming.filter((f) => matchesAccept(f));

			if (incoming.length && accepted.length === 0) {
				onError?.({
					code: "accept",
					message: "No files match the accepted types.",
				});

				return;
			}

			const withinSize = (f: File) => (maxFileSize ? f.size <= maxFileSize : true);
			const sized = accepted.filter(withinSize);

			if (accepted.length > 0 && sized.length === 0) {
				onError?.({
					code: "max_file_size",
					message: "All files exceed the maximum size.",
				});

				return;
			}

			setItems((prev) => {
				const capacity =
					typeof maxFiles === "number" ? Math.max(0, maxFiles - prev.length) : undefined;

				const capped = typeof capacity === "number" ? sized.slice(0, capacity) : sized;

				if (typeof capacity === "number" && sized.length > capacity) {
					onError?.({
						code: "max_files",
						message: "Too many files. Some were not added.",
					});
				}

				const next: (FileUIPart & { id: string })[] = [];

				for (const file of capped) {
					next.push({
						id: nanoid(),
						type: "file",
						url: URL.createObjectURL(file),
						mediaType: file.type,
						filename: file.name,
					});
				}

				return prev.concat(next);
			});
		},
		[matchesAccept, maxFiles, maxFileSize, onError],
	);

	const removeLocal = useCallback(
		(id: string) =>
			setItems((prev) => {
				const found = prev.find((file) => file.id === id);

				if (found?.url) {
					URL.revokeObjectURL(found.url);
				}

				return prev.filter((file) => file.id !== id);
			}),
		[],
	);

	const clearLocal = useCallback(
		() =>
			setItems((prev) => {
				for (const file of prev) {
					if (file.url) {
						URL.revokeObjectURL(file.url);
					}
				}

				return [];
			}),
		[],
	);

	const add = usingProvider ? controller.attachments.add : addLocal;
	const remove = usingProvider ? controller.attachments.remove : removeLocal;
	const clear = usingProvider ? controller.attachments.clear : clearLocal;

	const openFileDialog = usingProvider
		? controller.attachments.openFileDialog
		: openFileDialogLocal;

	// Let provider know about our hidden file input so external menus can call openFileDialog()
	useEffect(() => {
		if (!usingProvider) return;
		controller.__registerFileInput(inputRef, () => inputRef.current?.click());
	}, [usingProvider, controller]);

	// Note: File input cannot be programmatically set for security reasons
	// The syncHiddenInput prop is no longer functional
	useEffect(() => {
		if (syncHiddenInput && inputRef.current && files.length === 0) {
			inputRef.current.value = "";
		}
	}, [files, syncHiddenInput]);

	useEffect(() => {
		const form = formRef.current;

		if (!form) return;

		if (globalDrop) return; // when global drop is on, let the document-level handler own drops

		const onDragOver = (e: DragEvent) => {
			if (e.dataTransfer?.types?.includes("Files")) {
				e.preventDefault();
			}
		};

		const onDrop = (e: DragEvent) => {
			if (e.dataTransfer?.types?.includes("Files")) {
				e.preventDefault();
			}

			if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
				add(e.dataTransfer.files);
			}
		};

		form.addEventListener("dragover", onDragOver);
		form.addEventListener("drop", onDrop);

		return () => {
			form.removeEventListener("dragover", onDragOver);
			form.removeEventListener("drop", onDrop);
		};
	}, [add, globalDrop]);

	useEffect(() => {
		if (!globalDrop) return;

		const onDragOver = (e: DragEvent) => {
			if (e.dataTransfer?.types?.includes("Files")) {
				e.preventDefault();
			}
		};

		const onDrop = (e: DragEvent) => {
			if (e.dataTransfer?.types?.includes("Files")) {
				e.preventDefault();
			}

			if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
				add(e.dataTransfer.files);
			}
		};

		document.addEventListener("dragover", onDragOver);
		document.addEventListener("drop", onDrop);

		return () => {
			document.removeEventListener("dragover", onDragOver);
			document.removeEventListener("drop", onDrop);
		};
	}, [add, globalDrop]);

	useEffect(
		() => () => {
			if (!usingProvider) {
				for (const f of filesRef.current) {
					if (f.url) URL.revokeObjectURL(f.url);
				}
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only on unmount; filesRef always current
		[usingProvider],
	);

	const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
		if (event.currentTarget.files) {
			add(event.currentTarget.files);
		}

		// Reset input value to allow selecting files that were previously removed
		event.currentTarget.value = "";
	};

	const convertBlobUrlToDataUrl = async (url: string): Promise<string | null> => {
		try {
			const response = await fetch(url);
			const blob = await response.blob();

			return new Promise((resolve) => {
				const reader = new FileReader();
				reader.onloadend = () => resolve(reader.result as string);
				reader.onerror = () => resolve(null);
				reader.readAsDataURL(blob);
			});
		} catch {
			return null;
		}
	};

	const ctx = useMemo<AttachmentsContext>(
		() => ({
			files: files.map((item) => ({ ...item, id: item.id })),
			add,
			remove,
			clear,
			openFileDialog,
			fileInputRef: inputRef,
		}),
		[files, add, remove, clear, openFileDialog],
	);

	const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
		event.preventDefault();

		const form = event.currentTarget;

		const text = usingProvider
			? controller.textInput.value
			: (() => {
					const formData = new FormData(form);

					return (formData.get("message") as string) || "";
				})();

		// Reset form immediately after capturing text to avoid race condition
		// where user input during async blob conversion would be lost
		if (!usingProvider) {
			form.reset();
		}

		Promise.all(
			files.map(async ({ id: _id, ...item }) => {
				if (item.url?.startsWith("blob:")) {
					const dataUrl = await convertBlobUrlToDataUrl(item.url);

					return {
						...item,
						url: dataUrl ?? item.url,
					};
				}

				return item;
			}),
		)
			.then((convertedFiles: FileUIPart[]) => {
				try {
					const result = onSubmit({ text, files: convertedFiles }, event);

					if (result instanceof Promise) {
						result
							.then(() => {
								clear();

								if (usingProvider) {
									controller.textInput.clear();
								}
							})
							.catch(() => {
								// Don't clear on error - user may want to retry
							});
					} else {
						clear();

						if (usingProvider) {
							controller.textInput.clear();
						}
					}
				} catch {
					// Don't clear on error - user may want to retry
				}
			})
			.catch(() => {
				// Don't clear on error - user may want to retry
			});
	};

	const inner = (
		<>
			<input
				accept={accept}
				aria-label="Upload files"
				className="hidden"
				multiple={multiple}
				onChange={handleChange}
				ref={inputRef}
				title="Upload files"
				type="file"
			/>
			<form
				className={cn("w-full", className)}
				onSubmit={handleSubmit}
				ref={formRef}
				{...props}
			>
				<InputGroup className="overflow-hidden">{children}</InputGroup>
			</form>
		</>
	);

	return usingProvider ? (
		inner
	) : (
		<LocalAttachmentsContext.Provider value={ctx}>{inner}</LocalAttachmentsContext.Provider>
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
	onChange,
	className,
	placeholder = "What would you like to know?",
	...props
}: PromptInputTextareaProps) => {
	const controller = useOptionalPromptInputController();
	const attachments = usePromptInputAttachments();
	const [isComposing, setIsComposing] = useState(false);

	const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
		if (e.key === "Enter") {
			if (isComposing || e.nativeEvent.isComposing) {
				return;
			}

			if (e.shiftKey) {
				return;
			}

			e.preventDefault();

			const form = e.currentTarget.form;

			const submitButton = form?.querySelector(
				'button[type="submit"]',
			) as HTMLButtonElement | null;

			if (submitButton?.disabled) {
				return;
			}

			form?.requestSubmit();
		}

		if (
			e.key === "Backspace" &&
			e.currentTarget.value === "" &&
			attachments.files.length > 0
		) {
			e.preventDefault();
			const lastAttachment = attachments.files.at(-1);

			if (lastAttachment) {
				attachments.remove(lastAttachment.id);
			}
		}
	};

	const handlePaste: ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
		const items = event.clipboardData?.items;

		if (!items) {
			return;
		}

		const files: File[] = [];

		for (const item of items) {
			if (item.kind === "file") {
				const file = item.getAsFile();

				if (file) {
					files.push(file);
				}
			}
		}

		if (files.length > 0) {
			event.preventDefault();
			attachments.add(files);
		}
	};

	const controlledProps = controller
		? {
				value: controller.textInput.value,
				onChange: (e: ChangeEvent<HTMLTextAreaElement>) => {
					controller.textInput.setInput(e.currentTarget.value);
					onChange?.(e);
				},
			}
		: {
				onChange,
			};

	return (
		<InputGroupTextarea
			className={cn("field-sizing-content max-h-48 min-h-16", className)}
			name="message"
			onCompositionEnd={() => setIsComposing(false)}
			onCompositionStart={() => setIsComposing(true)}
			onKeyDown={handleKeyDown}
			onPaste={handlePaste}
			placeholder={placeholder}
			{...props}
			{...controlledProps}
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

// Note: Actions that perform side-effects (like opening a file dialog)
// are provided in opt-in modules (e.g., prompt-input-attachments).

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

interface SpeechRecognition extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	start(): void;
	stop(): void;
	onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
	onend: ((this: SpeechRecognition, ev: Event) => void) | null;
	onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
	onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
	results: SpeechRecognitionResultList;
	resultIndex: number;
}

type SpeechRecognitionResultList = {
	readonly length: number;
	item(index: number): SpeechRecognitionResult;
	[index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionResult = {
	readonly length: number;
	item(index: number): SpeechRecognitionAlternative;
	[index: number]: SpeechRecognitionAlternative;
	isFinal: boolean;
};

type SpeechRecognitionAlternative = {
	transcript: string;
	confidence: number;
};

interface SpeechRecognitionErrorEvent extends Event {
	error: string;
}

declare global {
	interface Window {
		SpeechRecognition: {
			new (): SpeechRecognition;
		};
		webkitSpeechRecognition: {
			new (): SpeechRecognition;
		};
	}
}
