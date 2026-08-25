import type { CreateKeySchemaType } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@db-studio/ui/field";
import { Input } from "@db-studio/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { useState } from "react";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { useOverlayStore } from "@/stores/overlay.store";
import { useRedisKeyMutations } from "../hooks/use-redis-browser";
import { encodeTextValue, RedisValueInput } from "./redis-value";

const KEY_TYPES = ["string", "hash", "list", "set", "zset", "stream"] as const;
const emptyValue = encodeTextValue("");

export const RedisCreateKeySheet = () => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();
	const [key, setKey] = useState(emptyValue);
	const [type, setType] = useState<(typeof KEY_TYPES)[number]>("string");
	const [first, setFirst] = useState(emptyValue);
	const [second, setSecond] = useState(emptyValue);
	const [score, setScore] = useState("0");
	const [ttl, setTtl] = useState("");
	const { createKey, isPending } = useRedisKeyMutations();
	const open = isOverlayOpen("redis-browser.create-key");

	const submit = async () => {
		let value: CreateKeySchemaType["value"];
		switch (type) {
			case "string":
				value = { kind: "string", value: first };
				break;
			case "hash":
				value = { kind: "hash", entries: [{ field: first, value: second }] };
				break;
			case "list":
				value = { kind: "list", entries: [first] };
				break;
			case "set":
				value = { kind: "set", members: [first] };
				break;
			case "zset":
				value = { kind: "zset", entries: [{ member: first, score: Number(score) }] };
				break;
			case "stream":
				value = { kind: "stream", id: "*", fields: [{ field: first, value: second }] };
				break;
		}

		await createKey({ key, type, value, ttlMs: ttl ? Number(ttl) * 1_000 : null });
		closeOverlay("redis-browser.create-key");
	};

	return (
		<SheetSidebar
			title="Create Redis key"
			description="Creates the key atomically and never overwrites an existing key."
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) closeOverlay("redis-browser.create-key");
			}}
			size="sm:max-w-md!"
			headerClassName="border-b border-border p-4"
			titleClassName="text-sm font-medium"
			contentClassName="space-y-4 px-4 py-4"
		>
			<FieldGroup className="gap-4">
				<Field>
					<FieldLabel htmlFor="redis-key-name">Key</FieldLabel>
					<RedisValueInput
						id="redis-key-name"
						value={key}
						onChange={setKey}
						placeholder="cache:user:42"
					/>
					<FieldDescription>
						Text, hexadecimal, and Base64 keys are supported.
					</FieldDescription>
				</Field>

				<Field>
					<FieldLabel htmlFor="redis-key-type">Type</FieldLabel>
					<Select
						value={type}
						onValueChange={(value) => setType(value as typeof type)}
					>
						<SelectTrigger id="redis-key-type">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{KEY_TYPES.map((item) => (
								<SelectItem
									key={item}
									value={item}
								>
									{item}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>

				<Field>
					<FieldLabel htmlFor="redis-key-first-value">
						{type === "hash" || type === "stream"
							? "Initial field"
							: type === "zset"
								? "Initial member"
								: "Initial value"}
					</FieldLabel>
					<RedisValueInput
						id="redis-key-first-value"
						value={first}
						onChange={setFirst}
					/>
				</Field>

				{(type === "hash" || type === "stream") && (
					<Field>
						<FieldLabel htmlFor="redis-key-second-value">Initial value</FieldLabel>
						<RedisValueInput
							id="redis-key-second-value"
							value={second}
							onChange={setSecond}
						/>
					</Field>
				)}

				{type === "zset" && (
					<Field>
						<FieldLabel htmlFor="redis-key-score">Score</FieldLabel>
						<Input
							id="redis-key-score"
							type="number"
							value={score}
							onChange={(event) => setScore(event.target.value)}
							className="font-mono"
						/>
					</Field>
				)}

				<Field>
					<FieldLabel htmlFor="redis-key-ttl">TTL in seconds</FieldLabel>
					<Input
						id="redis-key-ttl"
						type="number"
						min={1}
						value={ttl}
						onChange={(event) => setTtl(event.target.value)}
						placeholder="Persistent"
						className="font-mono"
					/>
					<FieldDescription>Leave empty to create a persistent key.</FieldDescription>
				</Field>
			</FieldGroup>

			<div className="flex justify-end gap-2 border-t border-border pt-4">
				<Button
					variant="outline"
					onClick={() => closeOverlay("redis-browser.create-key")}
				>
					Cancel
				</Button>
				<Button
					disabled={isPending}
					onClick={submit}
				>
					Create key
				</Button>
			</div>
		</SheetSidebar>
	);
};
