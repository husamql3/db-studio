// PROTOTYPE — throwaway. Floating bar that cycles UI prototype variants. Dev builds only.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

export const PrototypeSwitcher = ({
	variants,
	current,
	onChange,
}: {
	variants: { key: string; name: string }[];
	current: string;
	onChange: (key: string) => void;
}) => {
	const index = Math.max(
		0,
		variants.findIndex((v) => v.key === current),
	);
	const step = (delta: number) =>
		onChange(variants[(index + delta + variants.length) % variants.length].key);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const el = document.activeElement;
			if (
				el instanceof HTMLInputElement ||
				el instanceof HTMLTextAreaElement ||
				(el instanceof HTMLElement && el.isContentEditable)
			)
				return;
			if (e.key === "ArrowLeft") step(-1);
			if (e.key === "ArrowRight") step(1);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	if (!import.meta.env.DEV) return null;
	const variant = variants[index];

	return (
		<div className="fixed bottom-14 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1 rounded-full bg-fuchsia-600 px-1.5 py-1 text-xs font-medium text-white shadow-lg shadow-fuchsia-900/30">
			<button
				type="button"
				aria-label="Previous variant"
				className="rounded-full p-1 hover:bg-white/20"
				onClick={() => step(-1)}
			>
				<ChevronLeft className="size-4" />
			</button>
			<span className="px-2 tabular-nums">
				{variant.key} ({variant.name}) · {index + 1}/{variants.length}
			</span>
			<button
				type="button"
				aria-label="Next variant"
				className="rounded-full p-1 hover:bg-white/20"
				onClick={() => step(1)}
			>
				<ChevronRight className="size-4" />
			</button>
		</div>
	);
};
