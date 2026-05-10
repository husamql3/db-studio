import { AlertCircle, DatabaseZap } from "lucide-react";
import { Alert } from "../primitives/alert";
import { Button } from "../primitives/button";
import { Spinner } from "../primitives/spinner";

export default {
	title: "UI/Feedback States",
};

export const Loading = () => (
	<div className="flex h-32 w-72 items-center justify-center rounded-xl border bg-background text-foreground">
		<div className="flex items-center gap-3 text-muted-foreground text-xs">
			<Spinner size="size-5" />
			Loading records
		</div>
	</div>
);

export const Empty = () => (
	<div className="flex w-80 flex-col items-center gap-3 rounded-xl border bg-background p-8 text-center text-foreground">
		<div className="rounded-full border bg-muted/40 p-3">
			<DatabaseZap className="size-5 text-muted-foreground" />
		</div>
		<div>
			<p className="font-medium text-sm">No records yet</p>
			<p className="text-muted-foreground text-xs">
				Create the first row to preview dense table states.
			</p>
		</div>
		<Button size="sm">Add record</Button>
	</div>
);

export const ErrorState = () => (
	<div className="w-96 space-y-3 rounded-xl border bg-background p-4 text-foreground">
		<Alert
			variant="error"
			title="Connection failed"
			message="The database server refused the request. Check credentials and retry."
		/>
		<Button
			variant="outline"
			size="sm"
		>
			<AlertCircle />
			Retry
		</Button>
	</div>
);
