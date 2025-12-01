import {
	CircleAlert,
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	TriangleAlert,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-4 text-emerald-500" />,
				info: <InfoIcon className="size-4 text-blue-500" />,
				warning: <TriangleAlert className="size-4 text-amber-500" />,
				error: <CircleAlert className="size-4 text-red-500" />,
				loading: <Loader2Icon className="size-4 animate-spin text-blue-500" />,
			}}
			toastOptions={{
				classNames: {
					success:
						"border-emerald-500/50 border bg-emerald-50/50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400",
					info: "border-blue-500/50 border bg-blue-50/50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400",
					warning:
						"border-amber-500/50 border bg-amber-50/50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400",
					error:
						"border-red-500/50 border bg-red-50/50 text-red-600 dark:bg-red-950/20 dark:text-red-400",
					loading:
						"border-blue-500/50 border bg-blue-50/50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
