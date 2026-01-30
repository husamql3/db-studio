"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { AI_PROVIDERS, MODEL_LIST, type AiProvider } from "shared/constants";
import { cn } from "@/lib/utils";
import { useAiSettingsStore } from "@/stores/ai-settings.store";
import { useSheetStore } from "@/stores/sheet.store";

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
		provider,
		model,
		apiKeys,
		setIncludeSchemaInAiContext,
		setUseByocProxy,
		setByocProxyUrl,
		setProvider,
		setModel,
		setApiKeyForProvider,
	} = useAiSettingsStore();

	const byocUrlError = useMemo(() => {
		if (!useByocProxy || !byocProxyUrl.trim()) return null;
		return isValidByocUrl(byocProxyUrl) ? null : "Enter a valid HTTPS URL or leave empty";
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
					<SheetTitle className="text-lg font-semibold">Settings</SheetTitle>
				</SheetHeader>

				<div className="overflow-y-auto px-5 py-6 space-y-6">
					<section className="space-y-4">
						<h3 className="text-sm font-medium text-foreground">AI & Database Context</h3>

						<div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 p-3">
							<div className="space-y-0.5">
								<Label
									htmlFor="include-schema"
									className="text-sm font-medium cursor-pointer"
								>
									Include database schema in AI context
								</Label>
								<p className="text-xs text-muted-foreground">
									Introspect tables and columns and add them to the AI prompt for context-aware
									SQL and answers.
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
							<div className={cn("space-y-2 rounded-lg border border-zinc-800 p-3")}>
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
										Must be HTTPS. Same API as default: POST /chat with messages, systemPrompt,
										conversationId; respond with SSE.
									</p>
								)}
							</div>
						)}
					</section>

					<section className="space-y-4">
						<h3 className="text-sm font-medium text-foreground">AI Provider</h3>

						<div className="space-y-2 rounded-lg border border-zinc-800 p-3">
							<Label className="text-sm font-medium">Provider</Label>
							<Select
								value={provider}
								onValueChange={(value) => setProvider(value as AiProvider)}
							>
								<SelectTrigger className="h-8">
									<SelectValue placeholder="Select provider" />
								</SelectTrigger>
								<SelectContent>
									{AI_PROVIDERS.map((item) => (
										<SelectItem key={item} value={item}>
											{item.toUpperCase()}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2 rounded-lg border border-zinc-800 p-3">
							<Label className="text-sm font-medium">Model</Label>
							<Select value={model} onValueChange={setModel}>
								<SelectTrigger className="h-8">
									<SelectValue placeholder="Select model" />
								</SelectTrigger>
								<SelectContent>
									{MODEL_LIST.filter((item) => item.provider === provider).map((item) => (
										<SelectItem key={item.id} value={item.id}>
											{item.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2 rounded-lg border border-zinc-800 p-3">
							<Label className="text-sm font-medium">API Key (optional)</Label>
							<Input
								type="password"
								placeholder={`Enter ${provider.toUpperCase()} API key`}
								value={apiKeys[provider] ?? ""}
								onChange={(e) => setApiKeyForProvider(provider, e.target.value)}
								className="h-8"
							/>
							<p className="text-xs text-muted-foreground">
								Leave empty to use the default proxy key. Keys are stored locally.
							</p>
						</div>
					</section>
				</div>
			</SheetContent>
		</Sheet>
	);
};
