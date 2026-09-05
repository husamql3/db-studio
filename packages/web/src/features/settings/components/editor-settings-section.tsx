import { Label } from "@db-studio/ui/label";
import { Switch } from "@db-studio/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@db-studio/ui/toggle-group";
import {
	EDITOR_FONT_SIZES,
	type EditorFontSize,
	TAB_SIZES,
	type TabSize,
	usePersonalPreferencesStore,
} from "@/stores/personal-preferences.store";

export const EditorSettingsSection = () => {
	const { editor, setTabSize, setEditorFontSize, setEditorWordWrap } =
		usePersonalPreferencesStore();

	return (
		<section className="space-y-3">
			<div className="space-y-2 rounded-lg border p-3">
				<Label>Tab size</Label>
				<p className="text-xs text-muted-foreground">
					Indentation used by the query editor and JSON cells.
				</p>
				<ToggleGroup
					type="single"
					variant="outline"
					className="w-full"
					value={String(editor.tabSize)}
					onValueChange={(value) => {
						if (value) setTabSize(Number(value) as TabSize);
					}}
					aria-label="Tab size"
				>
					{TAB_SIZES.map((size) => (
						<ToggleGroupItem
							key={size}
							value={String(size)}
							className="flex-1"
						>
							{size} spaces
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			<div className="space-y-2 rounded-lg border p-3">
				<Label>Font size</Label>
				<p className="text-xs text-muted-foreground">Text size in the query editor.</p>
				<ToggleGroup
					type="single"
					variant="outline"
					className="w-full"
					value={String(editor.fontSize)}
					onValueChange={(value) => {
						if (value) setEditorFontSize(Number(value) as EditorFontSize);
					}}
					aria-label="Editor font size"
				>
					{EDITOR_FONT_SIZES.map((size) => (
						<ToggleGroupItem
							key={size}
							value={String(size)}
							className="flex-1"
						>
							{size} px
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			<div className="flex items-center justify-between gap-4 rounded-lg border p-3">
				<div className="space-y-1">
					<Label htmlFor="editor-word-wrap">Word wrap</Label>
					<p className="text-xs text-muted-foreground">
						Wrap long lines in the query editor instead of scrolling.
					</p>
				</div>
				<Switch
					id="editor-word-wrap"
					checked={editor.wordWrap}
					onCheckedChange={setEditorWordWrap}
				/>
			</div>
		</section>
	);
};
