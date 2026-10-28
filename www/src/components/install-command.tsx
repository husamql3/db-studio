import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const COMMANDS = {
	npx: "npx db-studio",
	pnpm: "pnpm dlx db-studio",
	yarn: "yarn dlx db-studio",
	bun: "bunx db-studio",
};
type Runner = keyof typeof COMMANDS;

// Both icons share one grid cell; blur during the cross-fade hides the moment they overlap.
const ICON =
	"col-start-1 row-start-1 size-3.5 transition-[opacity,transform,filter] duration-200 ease-out";

export function InstallCommand({ className }: { className?: string }) {
	const [runner, setRunner] = useState<Runner>("npx");
	const [copied, copy] = useCopyButton(() => navigator.clipboard.writeText(COMMANDS[runner]));

	return (
		<div className={cn("w-full max-w-md rounded-sm border bg-white/[0.02]", className)}>
			<div
				role="group"
				aria-label="Package runner"
				className="flex border-b px-1.5"
			>
				{(Object.keys(COMMANDS) as Runner[]).map((r) => (
					<button
						key={r}
						type="button"
						aria-pressed={r === runner}
						onClick={() => setRunner(r)}
						className="relative h-8 cursor-pointer px-2.5 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground aria-pressed:text-foreground after:absolute after:inset-x-2.5 after:-bottom-px after:h-px after:bg-foreground after:opacity-0 aria-pressed:after:opacity-100"
					>
						{r}
					</button>
				))}
			</div>

			<div className="flex h-12 items-center gap-3 pr-2 pl-4 text-sm">
				<span
					aria-hidden
					className="select-none text-muted-foreground"
				>
					$
				</span>
				<code className="flex-1 truncate">{COMMANDS[runner]}</code>
				<button
					type="button"
					onClick={copy}
					data-checked={copied || undefined}
					aria-label={copied ? "Copied" : "Copy command"}
					className="group grid size-8 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-white/5 hover:text-foreground active:scale-[0.97]"
				>
					<CopyIcon
						className={cn(
							ICON,
							"group-data-checked:scale-50 group-data-checked:opacity-0 group-data-checked:blur-xs",
						)}
					/>
					<CheckIcon
						className={cn(
							ICON,
							"scale-50 opacity-0 blur-xs group-data-checked:scale-100 group-data-checked:opacity-100 group-data-checked:blur-none",
						)}
					/>
				</button>
			</div>
		</div>
	);
}
