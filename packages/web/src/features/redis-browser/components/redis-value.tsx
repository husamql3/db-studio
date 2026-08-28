import type { EncodedRedisValueSchemaType } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import { Input } from "@db-studio/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@db-studio/ui/toggle-group";
import { cn } from "@db-studio/ui/utils";
import { Check, Copy, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type RedisValueMode = "text" | "json" | "hex" | "base64";

export const bytesFromBase64Url = (base64: string): Uint8Array => {
	const normalized = base64.replaceAll("-", "+").replaceAll("_", "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

export const base64UrlFromBytes = (bytes: Uint8Array): string => {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

export const encodeTextValue = (value: string): EncodedRedisValueSchemaType => ({
	base64: base64UrlFromBytes(new TextEncoder().encode(value)),
	utf8: value,
});

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

/** Encodes raw bytes, keeping `utf8` whenever the bytes are clean UTF-8 text. */
export const encodeBytesValue = (bytes: Uint8Array): EncodedRedisValueSchemaType => {
	try {
		return { base64: base64UrlFromBytes(bytes), utf8: utf8Decoder.decode(bytes) };
	} catch {
		return { base64: base64UrlFromBytes(bytes) };
	}
};

const hexFromBytes = (bytes: Uint8Array): string =>
	Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const bytesFromHex = (hex: string): Uint8Array | null => {
	const clean = hex.replaceAll(/\s/g, "");
	if (clean.length % 2 !== 0 || !/^[\da-f]*$/i.test(clean)) return null;
	return Uint8Array.from(clean.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
};

const isJson = (value?: string): boolean => {
	if (!value) return false;
	try {
		JSON.parse(value);
		return true;
	} catch {
		return false;
	}
};

export const RedisValue = ({
	value,
	compact = false,
	onDownload,
}: {
	value: EncodedRedisValueSchemaType;
	compact?: boolean;
	onDownload?: () => void;
}) => {
	const bytes = useMemo(() => bytesFromBase64Url(value.base64), [value.base64]);
	const [mode, setMode] = useState<RedisValueMode>(
		value.utf8 ? (isJson(value.utf8) ? "json" : "text") : "hex",
	);
	const [copied, setCopied] = useState(false);
	const effectiveMode: RedisValueMode =
		mode === "json" && !isJson(value.utf8)
			? value.utf8 === undefined
				? "hex"
				: "text"
			: mode;
	const display =
		effectiveMode === "hex"
			? hexFromBytes(bytes)
			: effectiveMode === "base64"
				? value.base64
				: effectiveMode === "json" && value.utf8
					? JSON.stringify(JSON.parse(value.utf8), null, 2)
					: (value.utf8 ?? "Binary value");

	const copy = async () => {
		await navigator.clipboard.writeText(display);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1200);
	};
	const download = () => {
		const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer]);
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "redis-value.bin";
		anchor.click();
		URL.revokeObjectURL(url);
	};

	if (compact) {
		return (
			<span
				className="truncate font-mono text-xs text-foreground"
				title={display}
			>
				{display || "∅"}
			</span>
		);
	}

	return (
		<div className="overflow-hidden border border-border bg-background">
			<div className="flex h-10 items-center justify-between border-b border-border">
				<ToggleGroup
					type="single"
					variant="ghost"
					size="sm"
					value={effectiveMode}
					onValueChange={(next) => next && setMode(next as RedisValueMode)}
					className="h-full rounded-none"
				>
					{(
						[
							"text",
							...(isJson(value.utf8) ? ["json" as const] : []),
							"hex",
							"base64",
						] as RedisValueMode[]
					).map((item) => (
						<ToggleGroupItem
							key={item}
							value={item}
							aria-label={`View value as ${item}`}
							disabled={(item === "text" || item === "json") && value.utf8 === undefined}
							className="h-full rounded-none! px-3 text-[10px] uppercase tracking-wider text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
						>
							{item}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<div className="flex">
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={copy}
						aria-label={copied ? "Value copied" : "Copy value"}
					>
						<span className="relative inline-flex items-center justify-center">
							<Copy
								className={cn(
									"transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
									copied
										? "scale-25 opacity-0 blur-[4px]"
										: "scale-100 opacity-100 blur-[0px]",
								)}
							/>
							<Check
								className={cn(
									"absolute inset-0 transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
									copied
										? "scale-100 opacity-100 blur-[0px]"
										: "scale-25 opacity-0 blur-[4px]",
								)}
							/>
						</span>
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={onDownload ?? download}
						aria-label="Download original bytes"
					>
						<Download />
					</Button>
				</div>
			</div>
			<pre className="max-h-[55vh] min-h-32 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-xs leading-5 text-foreground">
				{display}
			</pre>
		</div>
	);
};

/**
 * Parses the visible draft under the selected encoding. `null` means the draft
 * has no byte representation yet (odd-length or non-hex characters, malformed
 * Base64) — never a value to submit.
 */
const parseDraft = (
	draft: string,
	mode: "text" | "hex" | "base64",
): EncodedRedisValueSchemaType | null => {
	if (mode === "text") return encodeTextValue(draft);
	if (mode === "hex") {
		const parsed = bytesFromHex(draft);
		return parsed && encodeBytesValue(parsed);
	}
	try {
		return encodeBytesValue(bytesFromBase64Url(draft));
	} catch {
		return null;
	}
};

/**
 * Value editor with a text/hex/base64 encoding switch. The committed `value`
 * always mirrors what the input displays: an unparseable draft commits `null`
 * (rendered via `aria-invalid`), so consumers MUST disable their actions while
 * `value === null` instead of submitting a stale earlier value.
 */
export const RedisValueInput = ({
	value,
	onChange,
	placeholder,
	className,
	id,
}: {
	value: EncodedRedisValueSchemaType | null;
	onChange: (value: EncodedRedisValueSchemaType | null) => void;
	placeholder?: string;
	className?: string;
	id?: string;
}) => {
	const [mode, setMode] = useState<"text" | "hex" | "base64">(
		value !== null && value.utf8 === undefined ? "hex" : "text",
	);
	// While the draft is invalid (value === null) there is nothing canonical to
	// re-derive the text from, so the draft stays untouched.
	const shown =
		value === null
			? null
			: mode === "text"
				? (value.utf8 ?? "")
				: mode === "hex"
					? hexFromBytes(bytesFromBase64Url(value.base64))
					: value.base64;
	const [draft, setDraft] = useState(shown ?? "");
	useEffect(() => {
		if (shown !== null) setDraft(shown);
	}, [shown]);
	const update = (next: string) => {
		setDraft(next);
		onChange(parseDraft(next, mode));
	};
	const switchMode = (next: typeof mode) => {
		setMode(next);
		// An invalid draft may become valid under the new encoding (and vice
		// versa); re-commit so the parent always tracks the visible text.
		if (value === null) onChange(parseDraft(draft, next));
	};

	return (
		<div className={cn("flex min-w-0", className)}>
			<Select
				value={mode}
				onValueChange={(next) => switchMode(next as typeof mode)}
			>
				<SelectTrigger
					aria-label="Value encoding"
					className="h-8! w-18 shrink-0 rounded-e-none border-e-0 px-1 font-mono text-[10px] uppercase"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="text">Text</SelectItem>
					<SelectItem value="hex">Hex</SelectItem>
					<SelectItem value="base64">Base64</SelectItem>
				</SelectContent>
			</Select>
			<Input
				id={id}
				value={draft}
				onChange={(event) => update(event.target.value)}
				placeholder={placeholder}
				aria-invalid={value === null || undefined}
				className="rounded-s-none font-mono h-8!"
			/>
		</div>
	);
};
