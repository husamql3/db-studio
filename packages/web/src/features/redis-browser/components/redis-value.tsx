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
	const display =
		mode === "hex"
			? hexFromBytes(bytes)
			: mode === "base64"
				? value.base64
				: mode === "json" && value.utf8
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
			<div className="flex h-8 items-center justify-between border-b border-border px-1">
				<ToggleGroup
					type="single"
					variant="ghost"
					size="sm"
					value={mode}
					onValueChange={(next) => next && setMode(next as RedisValueMode)}
					className="rounded-none"
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
							className="h-7 rounded-none px-2 text-[10px] uppercase tracking-wider"
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
						aria-label="Copy value"
					>
						{copied ? <Check /> : <Copy />}
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

export const RedisValueInput = ({
	value,
	onChange,
	placeholder,
	className,
	id,
}: {
	value: EncodedRedisValueSchemaType;
	onChange: (value: EncodedRedisValueSchemaType) => void;
	placeholder?: string;
	className?: string;
	id?: string;
}) => {
	const [mode, setMode] = useState<"text" | "hex" | "base64">(
		value.utf8 === undefined ? "hex" : "text",
	);
	const bytes = bytesFromBase64Url(value.base64);
	const shown =
		mode === "text" ? (value.utf8 ?? "") : mode === "hex" ? hexFromBytes(bytes) : value.base64;
	const [draft, setDraft] = useState(shown);
	useEffect(() => setDraft(shown), [shown]);
	const update = (next: string) => {
		setDraft(next);
		if (mode === "text") onChange(encodeTextValue(next));
		if (mode === "hex") {
			const parsed = bytesFromHex(next);
			if (parsed) onChange({ base64: base64UrlFromBytes(parsed) });
		}
		if (mode === "base64") {
			try {
				onChange({ base64: base64UrlFromBytes(bytesFromBase64Url(next)) });
			} catch {
				// Keep the last valid binary value while the user is typing.
			}
		}
	};

	return (
		<div className={cn("flex min-w-0", className)}>
			<Select
				value={mode}
				onValueChange={(next) => setMode(next as typeof mode)}
			>
				<SelectTrigger
					aria-label="Value encoding"
					className="h-7 w-[4.5rem] shrink-0 rounded-r-none border-r-0 px-1 font-mono text-[10px] uppercase"
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
				className="rounded-l-none font-mono"
			/>
		</div>
	);
};
