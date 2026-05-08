import { Button } from "../primitives/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../primitives/dialog";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "../primitives/sheet";

export default {
	title: "UI/Overlays",
};

export const DialogState = () => (
	<Dialog>
		<DialogTrigger asChild>
			<Button>Open dialog</Button>
		</DialogTrigger>
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Drop table?</DialogTitle>
				<DialogDescription>
					This checks the compact destructive confirmation state used by schema actions.
				</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<DialogClose asChild>
					<Button variant="outline">Cancel</Button>
				</DialogClose>
				<Button variant="destructive">Drop table</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
);

export const SheetState = () => (
	<Sheet>
		<SheetTrigger asChild>
			<Button variant="outline">Open sheet</Button>
		</SheetTrigger>
		<SheetContent>
			<SheetHeader>
				<SheetTitle>Edit record</SheetTitle>
				<SheetDescription>Inspect side panel spacing and footer actions.</SheetDescription>
			</SheetHeader>
			<div className="grid gap-2 px-4 text-xs">
				<div className="rounded-md border bg-muted/30 p-3">
					{"{ id: 42, status: 'active' }"}
				</div>
				<div className="rounded-md border bg-muted/30 p-3">
					{"{ updated_at: '2026-05-04' }"}
				</div>
			</div>
			<SheetFooter>
				<Button>Save changes</Button>
			</SheetFooter>
		</SheetContent>
	</Sheet>
);
