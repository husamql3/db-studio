import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";

export const DevMode = () => {
	return (
		<Status
			className="gap-2 rounded-full px-3 py-4 text-sm absolute bottom-3 right-3"
			status="degraded"
			variant="secondary"
		>
			<StatusIndicator />
			<StatusLabel className="font-mono">Dev</StatusLabel>
		</Status>
	);
};
