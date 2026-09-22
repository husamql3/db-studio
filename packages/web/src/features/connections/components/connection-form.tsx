import {
	type EnvConnectionCandidateSchemaType,
	type SaveConnectionInputSchemaType,
	type SavedConnectionSchemaType,
	saveConnectionInputSchema,
} from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import { Input } from "@db-studio/ui/input";
import { Label } from "@db-studio/ui/label";
import { cn } from "@db-studio/ui/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileInput } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { desktop } from "@/lib/desktop";

export const CONNECTION_COLORS = [
	"#1447e6",
	"#16a34a",
	"#d97706",
	"#dc2626",
	"#9333ea",
	"#0891b2",
] as const;

export const ConnectionForm = ({
	editing,
	onSubmit,
	onCancel,
}: {
	editing: SavedConnectionSchemaType | null;
	onSubmit: (input: SaveConnectionInputSchemaType) => Promise<unknown>;
	onCancel: () => void;
}) => {
	const [candidates, setCandidates] = useState<EnvConnectionCandidateSchemaType[]>([]);
	const form = useForm<SaveConnectionInputSchemaType>({
		resolver: zodResolver(saveConnectionInputSchema),
		defaultValues: {
			id: editing?.id,
			name: editing?.name ?? "",
			// The stored URL is encrypted and never sent back; editing requires re-entering it.
			url: "",
			color: editing?.color ?? CONNECTION_COLORS[0],
		},
	});
	const color = form.watch("color");

	const importEnv = async () => {
		if (!desktop) return;
		const found = await desktop.importEnvFile();
		if (found.length === 0) {
			toast.info("No database URLs found in that file");
			return;
		}
		setCandidates(found);
		const [first] = found;
		if (first) applyCandidate(first);
	};

	const applyCandidate = (candidate: EnvConnectionCandidateSchemaType) => {
		form.setValue("url", candidate.url, { shouldValidate: true });
		if (!form.getValues("name")) {
			form.setValue("name", candidate.name, { shouldValidate: true });
		}
	};

	return (
		<form
			className="space-y-4 rounded-lg border p-4"
			onSubmit={form.handleSubmit(async (values) => {
				try {
					await onSubmit(values);
				} catch {
					// The mutation toast already reported the failure; keep the form filled.
					return;
				}
				form.reset({ name: "", url: "", color: CONNECTION_COLORS[0], id: undefined });
				setCandidates([]);
			})}
		>
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold">
					{editing ? `Edit ${editing.name}` : "New connection"}
				</h3>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={importEnv}
				>
					<FileInput className="size-3.5" />
					Import from .env
				</Button>
			</div>

			<div className="space-y-2">
				<Label htmlFor="connection-name">Name</Label>
				<Input
					id="connection-name"
					placeholder="Production Postgres"
					autoComplete="off"
					{...form.register("name")}
				/>
				{form.formState.errors.name && (
					<p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
				)}
			</div>

			<div className="space-y-2">
				<Label htmlFor="connection-url">Connection URL</Label>
				<Input
					id="connection-url"
					className="font-mono text-xs"
					placeholder="postgres://user:password@localhost:5432/app"
					autoComplete="off"
					spellCheck={false}
					{...form.register("url")}
				/>
				{form.formState.errors.url && (
					<p className="text-xs text-destructive">{form.formState.errors.url.message}</p>
				)}
				{candidates.length > 1 && (
					<div className="flex flex-wrap gap-1.5">
						{candidates.map((candidate) => (
							<button
								key={candidate.name}
								type="button"
								className="rounded-md border px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
								onClick={() => applyCandidate(candidate)}
							>
								{candidate.name}
							</button>
						))}
					</div>
				)}
			</div>

			<div className="space-y-2">
				<Label>Color</Label>
				<div className="flex gap-2">
					{CONNECTION_COLORS.map((option) => (
						<button
							key={option}
							type="button"
							aria-label={`Use color ${option}`}
							aria-pressed={color === option}
							className={cn(
								"size-6 rounded-full border-2 border-transparent transition-transform hover:scale-110",
								color === option && "border-foreground",
							)}
							style={{ backgroundColor: option }}
							onClick={() => form.setValue("color", option)}
						/>
					))}
				</div>
			</div>

			<div className="flex justify-end gap-2">
				{editing && (
					<Button
						type="button"
						variant="ghost"
						onClick={onCancel}
					>
						Cancel
					</Button>
				)}
				<Button
					type="submit"
					disabled={form.formState.isSubmitting}
				>
					{editing ? "Save changes" : "Save connection"}
				</Button>
			</div>
		</form>
	);
};
