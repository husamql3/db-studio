import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

export const SidebarSearch = ({
	setSearchTerm,
	searchTerm,
}: {
	setSearchTerm: (searchTerm: string) => void;
	searchTerm: string;
}) => {
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Handle keyboard shortcut "/" to focus search
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Focus search on "/" key press (unless already focused on an input)
			if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
				e.preventDefault();
				searchInputRef.current?.focus();
			}
			// Clear search on Escape
			if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
				setSearchTerm("");
				searchInputRef.current?.blur();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [setSearchTerm]);

	return (
		<div className="p-3 space-y-3">
			<button
				className="w-full h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm text-zinc-300"
				type="button"
			>
				Add Table
			</button>

			<div className="relative">
				<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
				<input
					ref={searchInputRef}
					type="text"
					placeholder="Search tables"
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					className="w-full h-8 pl-8 pr-8 rounded-md bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
				/>
				<kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded">
					/
				</kbd>
			</div>
		</div>
	);
};
