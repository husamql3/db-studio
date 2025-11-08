import { type KeyboardEvent, useCallback } from "react";

export const AddRecordBtn = ({ onRowAdd }: { onRowAdd: () => void }) => {
	const onAddRowKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>) => {
			if (!onRowAdd) return;

			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				onRowAdd();
			}
		},
		[onRowAdd],
	);

	const handleClick = useCallback(() => {
		onRowAdd();
	}, [onRowAdd]);

	return (
		<button
			type="button"
			className="h-8 border-r border-zinc-800 px-3 flex items-center justify-center text-sm font-medium hover:bg-zinc-900 transition-colors text-zinc-400"
			onClick={handleClick}
			tabIndex={0}
			onKeyDown={onAddRowKeyDown}
		>
			Add Record
		</button>
	);
};
