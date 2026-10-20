import {
	CONNECTION_COLORS,
	type ConnectionColorSchemaType,
	type ConnectionSummarySchemaType,
} from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@db-studio/ui/dropdown-menu";
import { cn } from "@db-studio/ui/utils";
import { Ellipsis, Palette, Pencil, Trash2 } from "lucide-react";
import { useManageConnection } from "../hooks/use-manage-connection";
import { ConnectionColorDot } from "./connection-color-dot";

/** The "…" menu of a saved connection: rename, color, delete. */
export const ConnectionActionsMenu = ({
	connection,
	onRename,
}: {
	connection: ConnectionSummarySchemaType;
	onRename: () => void;
}) => {
	const { setColor, remove } = useManageConnection(connection);
	const colors: (ConnectionColorSchemaType | null)[] = [null, ...CONNECTION_COLORS];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Actions for ${connection.name}`}
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<Ellipsis />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				onClick={(e) => e.stopPropagation()}
			>
				<DropdownMenuItem onSelect={onRename}>
					<Pencil /> Rename
				</DropdownMenuItem>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<Palette /> Color
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="flex items-center gap-1.5 p-2">
						{colors.map((color) => (
							<button
								key={color ?? "none"}
								type="button"
								aria-label={color ?? "No color"}
								aria-pressed={connection.color === color}
								onClick={() => setColor(color)}
								className={cn(
									"grid size-5 place-items-center rounded-full",
									connection.color === color &&
										"ring-2 ring-ring ring-offset-1 ring-offset-popover",
								)}
							>
								<ConnectionColorDot
									color={color}
									className="size-3.5"
								/>
							</button>
						))}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					onSelect={remove}
				>
					<Trash2 /> Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
