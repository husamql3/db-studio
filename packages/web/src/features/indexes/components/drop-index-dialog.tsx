import { Button } from "@db-studio/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@db-studio/ui/dialog";
import { useOverlayStore } from "@/stores/overlay.store";
import { useDropIndex } from "../hooks/use-drop-index";
import { useIndexDropStore } from "../stores/index-drop.store";

export const DropIndexDialog = ({ tableName }: { tableName: string }) => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();
	const { droppingIndex } = useIndexDropStore();
	const { dropIndex, isDroppingIndex } = useDropIndex({ tableName });

	if (!droppingIndex) return null;

	return (
		<Dialog
			open={isOverlayOpen("indexes.drop-index")}
			onOpenChange={(open) => {
				if (!open) closeOverlay("indexes.drop-index");
			}}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Drop Index</DialogTitle>
					<DialogDescription>
						Drop the index{" "}
						<span className="font-semibold text-foreground">"{droppingIndex.indexName}"</span>{" "}
						from table <span className="font-semibold text-foreground">"{tableName}"</span>? No
						rows are deleted, but queries that rely on this index may get slower.
					</DialogDescription>
				</DialogHeader>

				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={() => closeOverlay("indexes.drop-index")}
						disabled={isDroppingIndex}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={() => dropIndex(droppingIndex.indexName)}
						disabled={isDroppingIndex}
					>
						{isDroppingIndex ? "Dropping..." : "Drop Index"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
