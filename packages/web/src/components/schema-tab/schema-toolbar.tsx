import { Button } from "@db-studio/ui/button";
import { Plus, RefreshCw } from "lucide-react";
import { useSheetStore } from "@/stores/sheet.store";

export const SchemaToolbar = ({
	tableName,
	refetch,
	isRefetching = false,
}: {
	tableName: string;
	refetch: () => Promise<unknown>;
	isRefetching?: boolean;
}) => {
	const { openSheet } = useSheetStore();

	return (
		<header className="max-h-8 overflow-hidden border-b border-zinc-800 w-full flex items-center bg-black sticky top-0 left-0 right-0 z-0">
			<Button
				type="button"
				variant="ghost"
				className="size-8! aspect-square border-x-0 border-y-0 border-zinc-800 rounded-none"
				onClick={() => void refetch()}
				aria-label={`Refetch schema for ${tableName}`}
				disabled={isRefetching}
			>
				<RefreshCw className="size-4" />
			</Button>

			<Button
				type="button"
				variant="default"
				className="h-8! border-l border-y-0 border-r-0 border-zinc-800 rounded-none flex items-center gap-2"
				onClick={() => openSheet("add-column")}
			>
				<Plus className="size-4" />
				Add Column
			</Button>
		</header>
	);
};
