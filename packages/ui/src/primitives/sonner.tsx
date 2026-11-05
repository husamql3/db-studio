import { CircleCheck, Info, Loader2, OctagonAlert, TriangleAlert } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Pass the app's resolved `theme`; sonner cannot see it otherwise. */
const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			className="toaster group"
			icons={{
				success: <CircleCheck className="size-4 text-emerald-500" />,
				info: <Info className="size-4 text-blue-500" />,
				warning: <TriangleAlert className="size-4 text-amber-500" />,
				error: <OctagonAlert className="size-4 text-red-500" />,
				loading: <Loader2 className="size-4 animate-spin text-blue-500" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: "cn-toast",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
