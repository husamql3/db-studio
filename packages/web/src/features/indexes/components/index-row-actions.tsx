import type { IndexInfoSchemaType } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { Lock, Trash2 } from "lucide-react";
import { useOverlayStore } from "@/stores/overlay.store";
import { useIndexDropStore } from "../stores/index-drop.store";

export const IndexRowActions = ({ index }: { index: IndexInfoSchemaType }) => {
	const { openOverlay } = useOverlayStore();
	const { setDroppingIndex } = useIndexDropStore();

	if (index.kind !== "index") {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="inline-flex text-muted-foreground/40">
						<Lock className="size-3.5" />
					</span>
				</TooltipTrigger>
				<TooltipContent side="left">
					<p>Backs a constraint. Drop the constraint to remove it.</p>
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			className="text-muted-foreground hover:text-destructive"
			aria-label={`Drop index ${index.indexName}`}
			onClick={() => {
				setDroppingIndex(index);
				openOverlay("indexes.drop-index");
			}}
		>
			<Trash2 className="size-3.5" />
		</Button>
	);
};
