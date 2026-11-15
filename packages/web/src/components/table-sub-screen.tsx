import { Button } from "@db-studio/ui/button";
import { Spinner } from "@db-studio/ui/spinner";
import { Link } from "@tanstack/react-router";
import { Plus, RefreshCw, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { CONSTANTS } from "@/utils/constants";

/** The loading, error and toolbar frame shared by a table's schema and indexes screens. */
export const TableSubScreen = ({
	tableName,
	subject,
	isLoading,
	error,
	refetch,
	isRefetching,
	action,
	children,
}: {
	tableName: string;
	/** Names what the screen lists, as in "Failed to load schema". */
	subject: string;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
	isRefetching: boolean;
	/** The toolbar's primary button, omitted when the screen offers none. */
	action?: { label: string; onClick: () => void };
	children: ReactNode;
}) => {
	const schemaName = useTableSchemaName();

	if (isLoading) {
		return (
			<div className="size-full flex items-center justify-center">
				<Spinner size="size-7" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="size-full flex flex-col items-center justify-center gap-2">
				<div className="text-sm font-medium">Failed to load {subject}</div>
				<div className="text-sm text-muted-foreground">{error.message}</div>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col overflow-hidden">
			<header className="max-h-8 overflow-hidden border-b border-border w-full flex items-center bg-background text-foreground sticky top-0 left-0 right-0 z-0">
				<Button
					size="icon-segment"
					type="button"
					variant="ghost"
					className="border-x-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
					onClick={() => void refetch()}
					aria-label={`Refetch ${subject} for ${tableName}`}
					disabled={isRefetching}
				>
					<RefreshCw />
				</Button>

				<Button
					size="segment"
					variant="ghost"
					asChild
					className="border-l border-r-0 border-border text-muted-foreground hover:text-foreground"
				>
					<Link
						to="/table/$table"
						params={{ table: tableName }}
						search={{ [CONSTANTS.TABLE_SCHEMA]: schemaName }}
						aria-label={`View data for ${tableName}`}
					>
						<Table2 />
						View data
					</Link>
				</Button>

				{action && (
					<Button
						size="segment"
						type="button"
						variant="default"
						className="border-l border-r-0 border-border"
						onClick={action.onClick}
					>
						<Plus />
						{action.label}
					</Button>
				)}
			</header>
			{children}
		</div>
	);
};
