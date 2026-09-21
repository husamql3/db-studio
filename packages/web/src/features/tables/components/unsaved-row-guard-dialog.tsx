import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@db-studio/ui/alert-dialog";
import { useUnsavedRowGuard } from "../hooks/use-unsaved-row-guard";

export const UnsavedRowGuardDialog = () => {
	const { isBlocked, discardAndContinue, keepEditing } = useUnsavedRowGuard();

	return (
		<AlertDialog
			open={isBlocked}
			onOpenChange={(isOpen) => {
				if (!isOpen) keepEditing();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
					<AlertDialogDescription>
						This record has unsaved changes. Leaving discards them. Continue?
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Keep editing</AlertDialogCancel>
					<AlertDialogAction onClick={discardAndContinue}>Discard changes</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
