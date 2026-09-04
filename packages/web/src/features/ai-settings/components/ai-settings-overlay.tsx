import { Button } from "@db-studio/ui/button";
import { Input } from "@db-studio/ui/input";
import { Label } from "@db-studio/ui/label";
import { Switch } from "@db-studio/ui/switch";
import { useByok } from "@tanstack/ai-react";
import { useState } from "react";
import { toast } from "sonner";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { useOverlayStore } from "@/stores/overlay.store";
import { aiByok } from "../byok";
import { useAiSettingsStore } from "../stores/ai-settings.store";

export const AiSettingsOverlay = () => {
	const [apiKey, setApiKey] = useState("");
	const snapshot = useByok(aiByok);
	const { includeSchemaInAiContext, setIncludeSchemaInAiContext } = useAiSettingsStore();
	const { closeOverlay, isOverlayOpen } = useOverlayStore();
	const status = snapshot.status.gemini;
	const maskedKey = status && "masked" in status ? status.masked : null;

	const saveApiKey = async () => {
		const nextKey = apiKey.trim();
		if (!nextKey) return;

		await toast.promise(aiByok.update("gemini", nextKey), {
			loading: "Saving Gemini key...",
			success: "Gemini key saved securely",
			error: (error: Error) => error.message || "Could not save Gemini key",
		});
		setApiKey("");
	};

	const removeApiKey = async () => {
		await toast.promise(aiByok.clear("gemini"), {
			loading: "Removing Gemini key...",
			success: "Using the hosted Gemini key",
			error: (error: Error) => error.message || "Could not remove Gemini key",
		});
	};

	return (
		<SheetSidebar
			title="AI Settings"
			description="Control what database context is shared and optionally use your own Gemini key."
			open={isOverlayOpen("settings.ai")}
			size="sm:max-w-md!"
			onOpenChange={(open) => {
				if (!open) closeOverlay("settings.ai");
			}}
		>
			<section className="space-y-3">
				<div className="flex items-center justify-between gap-4 rounded-lg border p-3">
					<div className="space-y-1">
						<Label htmlFor="include-schema">Include database schema</Label>
						<p className="text-xs text-muted-foreground">
							Share table and column metadata with the assistant for context-aware answers.
						</p>
					</div>
					<Switch
						id="include-schema"
						checked={includeSchemaInAiContext}
						onCheckedChange={setIncludeSchemaInAiContext}
					/>
				</div>
			</section>

			<section className="space-y-3">
				<div>
					<h3 className="text-sm font-medium">Gemini API key</h3>
					<p className="text-xs text-muted-foreground">
						Stored with a passkey when supported, otherwise kept only for this browser tab. The
						key is sent in a request header and is never saved by db-studio.
					</p>
				</div>
				<div className="space-y-2 rounded-lg border p-3">
					<Label htmlFor="gemini-api-key">Personal key</Label>
					<Input
						id="gemini-api-key"
						type="password"
						autoComplete="off"
						value={apiKey}
						onChange={(event) => setApiKey(event.target.value)}
						placeholder={maskedKey ? `Saved ${maskedKey}` : "Paste a Gemini API key"}
					/>
					{snapshot.storageError && (
						<p className="text-xs text-destructive">{snapshot.storageError}</p>
					)}
					<div className="flex gap-2">
						<Button
							type="button"
							disabled={!apiKey.trim()}
							onClick={saveApiKey}
						>
							Save key
						</Button>
						{status && status.state !== "empty" && (
							<Button
								type="button"
								variant="outline"
								onClick={removeApiKey}
							>
								Use hosted key
							</Button>
						)}
					</div>
				</div>
			</section>
		</SheetSidebar>
	);
};
