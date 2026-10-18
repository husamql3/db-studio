import { Spinner } from "@db-studio/ui/spinner";
import { VisualizerCanvas } from "@/features/visualizer/components/visualizer-canvas";
import { useSchemaGraph } from "@/features/visualizer/hooks/use-schema-graph";

export const VisualizerScreen = () => {
	const { tables, edges, isLoading, error } = useSchemaGraph();

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner size="size-6" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Couldn't load the schema: {error.message}
			</div>
		);
	}

	if (tables.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				This database has no tables yet.
			</div>
		);
	}

	return (
		<div className="relative h-full w-full">
			<VisualizerCanvas
				tables={tables}
				edges={edges}
			/>
			{edges.length === 0 && (
				<p className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-md border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
					This database has no foreign keys.
				</p>
			)}
		</div>
	);
};
