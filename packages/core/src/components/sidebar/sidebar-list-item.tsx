// import {
// 	IconCopy,
// 	IconDots,
// 	IconDownload,
// 	IconEdit,
// 	IconFileExcel,
// 	IconTrash,
// } from "@tabler/icons-react";

import { Link, useParams } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
// import {
// 	DropdownMenu,
// 	DropdownMenuContent,
// 	DropdownMenuGroup,
// 	DropdownMenuItem,
// 	DropdownMenuPortal,
// 	DropdownMenuSeparator,
// 	DropdownMenuSub,
// 	DropdownMenuSubContent,
// 	DropdownMenuSubTrigger,
// 	DropdownMenuTrigger,
// } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CONSTANTS } from "@/utils/constants";
// import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";

export const SidebarListItem = ({
	tableName,
	rowCount,
}: {
	tableName: string;
	rowCount: number;
}) => {
	const params = useParams({ strict: false });
	const table = params.table as string | undefined;

	const [, setFilters] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.FILTERS);
	const [, setColumnName] = useQueryState(CONSTANTS.COLUMN_NAME);
	const [, setSort] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.SORT);
	const [, setOrder] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.ORDER);

	const handleClick = () => {
		// reset the table filters
		setFilters(null);
		setColumnName(null);
		setSort(null);
		setOrder(null);
	};

	return (
		<li className="relative">
			<Link
				to="/table/$table"
				params={{
					table: tableName,
				}}
				onClick={handleClick}
				className={cn(
					"w-full flex gap-0.5 px-4 py-1.5 text-sm transition-colors text-left",
					"hover:text-zinc-100 focus:outline-none focus:bg-accent/10 focus:text-zinc-100 justify-start items-center",
					table === tableName ? "text-white bg-zinc-800/50" : "text-zinc-400",
				)}
			>
				{table === tableName && (
					<span className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />
				)}
				<span className="flex-1">{tableName}</span>
				<Kbd>{rowCount}</Kbd>
			</Link>
			{/* <DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
				>
					<IconDots />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="w-56"
				align="start"
			>
				<DropdownMenuGroup>
					<DropdownMenuItem>
						<IconCopy className="size-4" />
						Copy name
					</DropdownMenuItem>
					<DropdownMenuItem>
						<IconCopy className="size-4" />
						Copy scheme
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem>
						<IconEdit className="size-4" />
						Edit table name
					</DropdownMenuItem>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<IconDownload className="size-4" />
							Export data
						</DropdownMenuSubTrigger>
						<DropdownMenuPortal>
							<DropdownMenuSubContent>
								<DropdownMenuItem>
									<IconDownload className="size-4" />
									Export as CSV
								</DropdownMenuItem>
								<DropdownMenuItem>
									<IconDownload className="size-4" />
									Export as JSON
								</DropdownMenuItem>
								<DropdownMenuItem>
									<IconFileExcel className="size-4" />
									Export as Excel
								</DropdownMenuItem>
							</DropdownMenuSubContent>
						</DropdownMenuPortal>
					</DropdownMenuSub>
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive">
						<IconTrash className="size-4" />
						Delete table
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu> */}
		</li>
	);
};
