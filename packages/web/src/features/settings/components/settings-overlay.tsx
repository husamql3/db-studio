import { Separator } from "@db-studio/ui/separator";
import type { ReactNode } from "react";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { useOverlayStore } from "@/stores/overlay.store";
import { AiSettingsSection } from "./ai-settings-section";
import { EditorSettingsSection } from "./editor-settings-section";

const SettingsGroup = ({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: ReactNode;
}) => (
	<div className="space-y-3">
		<div className="space-y-1">
			<h3 className="text-sm font-semibold">{title}</h3>
			<p className="text-xs text-muted-foreground">{description}</p>
		</div>
		{children}
	</div>
);

export const SettingsOverlay = () => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();

	return (
		<SheetSidebar
			title="Settings"
			description="Changes apply immediately and are saved on this device."
			open={isOverlayOpen("settings.app")}
			size="sm:max-w-md!"
			onOpenChange={(open) => {
				if (!open) closeOverlay("settings.app");
			}}
		>
			<SettingsGroup
				title="Editor"
				description="Query editor and JSON cell behavior."
			>
				<EditorSettingsSection />
			</SettingsGroup>

			<Separator />

			<SettingsGroup
				title="AI"
				description="Provider, model, and API key for the assistant."
			>
				<AiSettingsSection />
			</SettingsGroup>
		</SheetSidebar>
	);
};
