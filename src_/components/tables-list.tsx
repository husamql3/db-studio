import { cn } from "../utils/cn";

export const TablesList = ({
	item,
	selectedIds,
	onSelect,
}: {
	item: { id: string; label: string };
	selectedIds: Set<string>;
	onSelect: (id: string) => void;
}) => {
	const isSelected = selectedIds.has(item.id);

	const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		onSelect(item.id);
	};

	return (
		<li className="relative">
			<button
				type="button"
				onClick={handleClick}
				className={cn(
					"w-full flex gap-2 px-4 py-1.5 text-sm transition-colors text-left",
					"hover:text-zinc-100 focus:outline-none focus:bg-blue-500/10 focus:text-zinc-100 justify-start items-center",
					isSelected ? "text-white bg-zinc-800/50" : "text-zinc-400",
				)}
			>
				{isSelected && <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
				<span className="flex-1">{item.label}</span>
			</button>
		</li>
	);
};
