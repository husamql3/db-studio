import type { LucideIcon } from "lucide-react";
import { CircleAlert, CircleCheckIcon, InfoIcon, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "info" | "warning" | "error" | "success";

interface AlertProps {
	variant: AlertVariant;
	title: string;
	message?: string;
	className?: string;
}

const alertConfig: Record<
	AlertVariant,
	{
		icon: LucideIcon;
		containerClass: string;
		iconClass: string;
	}
> = {
	info: {
		icon: InfoIcon,
		containerClass: "border-blue-500/50 bg-blue-50/50 text-blue-600 dark:bg-blue-950/20",
		iconClass: "text-blue-500",
	},
	warning: {
		icon: TriangleAlert,
		containerClass:
			"border-amber-500/50 bg-amber-50/50 text-amber-600 dark:bg-amber-950/20",
		iconClass: "text-amber-500",
	},
	error: {
		icon: CircleAlert,
		containerClass: "border-red-500/50 bg-red-50/50 text-red-600 dark:bg-red-950/20",
		iconClass: "text-red-500",
	},
	success: {
		icon: CircleCheckIcon,
		containerClass:
			"border-emerald-500/50 bg-emerald-50/50 text-emerald-600 dark:bg-emerald-950/20",
		iconClass: "text-emerald-500",
	},
};

export const Alert = ({ variant, title, message, className }: AlertProps) => {
	const config = alertConfig[variant];
	const Icon = config.icon;

	return (
		<div className={cn("rounded-md border px-4 py-3", config.containerClass, className)}>
			<p className={cn("text-sm flex items-center gap-2", message ? "mb-1" : "")}>
				<Icon
					aria-hidden="true"
					className={cn("-mt-0.5 inline-flex opacity-80", config.iconClass)}
					size={16}
				/>
				<span className="font-medium">{title}</span>
			</p>
			{message && <p className="text-xs opacity-90 ml-7">{message}</p>}
		</div>
	);
};
