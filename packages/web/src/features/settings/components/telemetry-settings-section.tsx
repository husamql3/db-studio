import { Button } from "@db-studio/ui/button";
import { Label } from "@db-studio/ui/label";
import { Switch } from "@db-studio/ui/switch";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	getTelemetryConfig,
	initPosthog,
	resetTelemetryIdentifier,
	setTelemetryPreference,
} from "@/lib/posthog";
import { initSentry, Sentry } from "@/lib/sentry";

export const TelemetrySettingsSection = () => {
	const [enabled, setEnabled] = useState(getTelemetryConfig()?.enabled ?? false);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		void initPosthog().then((value) => setEnabled(value?.enabled ?? false));
	}, []);

	const updatePreference = async (nextEnabled: boolean) => {
		setIsSaving(true);
		try {
			const value = await setTelemetryPreference(nextEnabled);
			setEnabled(value.enabled);
			if (value.enabled) initSentry();
			else await Sentry.close(500);
			toast.success(value.enabled ? "Analytics enabled" : "Analytics disabled");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not update analytics");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<section className="space-y-3">
			<div className="flex items-center justify-between gap-4 rounded-lg border p-3">
				<div className="space-y-1">
					<Label htmlFor="anonymous-telemetry">Anonymous analytics</Label>
					<p className="text-xs text-muted-foreground">
						Share feature usage, database engine, country, performance, and sanitized errors.
						Queries, schemas, names, and values are never collected.
					</p>
				</div>
				<Switch
					id="anonymous-telemetry"
					checked={enabled}
					disabled={isSaving}
					onCheckedChange={(value) => void updatePreference(value)}
				/>
			</div>
			<Button
				type="button"
				variant="outline"
				disabled={isSaving}
				onClick={() => {
					setIsSaving(true);
					void resetTelemetryIdentifier()
						.then(() => toast.success("Analytics identifier reset"))
						.catch(() => toast.error("Could not reset analytics identifier"))
						.finally(() => setIsSaving(false));
				}}
			>
				Reset analytics identifier
			</Button>
		</section>
	);
};
