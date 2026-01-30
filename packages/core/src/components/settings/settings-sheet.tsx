"use client";

import { useMemo } from "react";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAiSettingsStore } from "@/stores/ai-settings.store";
import { useSheetStore } from "@/stores/sheet.store";
import { cn } from "@/lib/utils";

function isValidByocUrl(value: string): boolean {
	if (!value.trim()) return true;
	try {
		const url = new URL(value.trim());
		return url.protocol === "https:";
	} catch {
		return false;
	}
}

export const SettingsSheet = () => {
	const { closeSheet, isSheetOpen } = useSheetStore();
	const {
		includeSchemaInAiContext,
		useByocProxy,
		byocProxyUrl,
		setIncludeSchemaInAiContext,
		setUseByocProxy,
		setByocProxyUrl,
	} = useAiSettingsStore();

	const byocUrlError = useMemo(() => {
		if (!useByocProxy || !byocProxyUrl.trim()) return null;
		return isValidByocUrl(byocProxyUrl)
			? null
			: "Enter a valid HTTPS URL or leave empty";
	}, [useByocProxy, byocProxyUrl]);

	return (
		<Sheet
			open={isSheetOpen("settings")}
			onOpenChange={(open) => {
				if (!open) closeSheet("settings");
			}}
		>
			<SheetContent
				side="right"
				className="sm:max-w-md!"
				showCloseButton
			>
				<SheetHeader className="border-b border-zinc-800 p-3">
					<SheetTitle className="text-lg font-semibold">
						Settings
					</SheetTitle>
				</SheetHeader>

				<div className="overflow-y-auto px-5 py-6 space-y-6">
					<section className="space-y-4">
						<h3 className="text-sm font-medium text-foreground">
							AI & Database Context
						</h3>

						<div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 p-3">
							<div className="space-y-0.5">
								<Label
									htmlFor="include-schema"
									className="text-sm font-medium cursor-pointer"
								>
									Include database schema in AI context
								</Label>
								<p className="text-xs text-muted-foreground">
									Introspect tables and columns and add them to the AI prompt for
									context-aware SQL and answers.
								</p>
							</div>
							<Switch
								id="include-schema"
								checked={includeSchemaInAiContext}
								onCheckedChange={setIncludeSchemaInAiContext}
							/>
						</div>

						<div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 p-3">
							<div className="space-y-0.5">
								<Label
									htmlFor="use-byoc"
									className="text-sm font-medium cursor-pointer"
								>
									Use custom AI endpoint (BYOC)
								</Label>
								<p className="text-xs text-muted-foreground">
									Use your own proxy/API for AI instead of the default.
								</p>
							</div>
							<Switch
								id="use-byoc"
								checked={useByocProxy}
								onCheckedChange={setUseByocProxy}
							/>
						</div>

						{useByocProxy && (
							<div
								className={cn(
									"space-y-2 rounded-lg border border-zinc-800 p-3",
								)}
							>
								<Label
									htmlFor="byoc-url"
									className="text-sm font-medium"
								>
									Custom proxy URL
								</Label>
								<Input
									id="byoc-url"
									type="url"
									placeholder="https://your-worker.workers.dev"
									value={byocProxyUrl}
									onChange={(e) => setByocProxyUrl(e.target.value)}
									className={cn("h-8", byocUrlError && "border-destructive")}
									aria-invalid={Boolean(byocUrlError)}
									aria-describedby={byocUrlError ? "byoc-url-error" : undefined}
								/>
								{byocUrlError ? (
									<p
										id="byoc-url-error"
										className="text-xs text-destructive"
									>
										{byocUrlError}
									</p>
								) : (
									<p className="text-xs text-muted-foreground">
										Must be HTTPS. Same API as default: POST /chat with
										messages, systemPrompt, conversationId; respond with SSE.
									</p>
								)}
							</div>
						)}
					</section>
				</div>
			</SheetContent>
		</Sheet>
	);
};
