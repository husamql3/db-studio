"use client";

import { useEffect, useState } from "react";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { useSheetStore } from "@/stores/sheet.store";

export function CommandPalette() {
	const { openSheet } = useSheetStore();
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((open) => !open);
			}
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, []);

	return (
		<CommandDialog
			open={open}
			onOpenChange={setOpen}
		>
			<CommandInput placeholder="Type a command or search..." />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>
				<CommandGroup heading="Actions">
					<CommandItem
						onSelect={() => {
							setOpen(false);
							openSheet("add-table");
						}}
					>
						<span>Add Table</span>
					</CommandItem>
					<CommandItem
						onSelect={() => {
							setOpen(false);
							openSheet("add-row");
						}}
					>
						<span>Add Row</span>
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
