import { Link, useParams } from "@tanstack/react-router";
import type { TableInfo } from "shared/types";
// import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
// import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const SidebarListTablesItem = ({ tableName, rowCount }: TableInfo) => {
	const params = useParams({ strict: false });
	const table = params.table as string | undefined;
	const isActive = table === tableName;

	return (
		<li className="relative">
			<Link
				to="/table/$table"
				params={{
					table: tableName,
				}}
				className={cn(
					"w-full flex gap-0.5 px-4 py-1.5 text-sm transition-colors text-left",
					"hover:text-zinc-100 focus:outline-none focus:bg-accent/10 focus:text-zinc-100 justify-start items-center",
					isActive ? "text-white bg-zinc-800/50" : "text-zinc-400",
				)}
			>
				{isActive && <span className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />}
				<span className="flex-1">{tableName}</span>
				<div className="flex items-center gap-1">
					{/* 	{isActive && (
						<DropdownMenu>
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
									<DropdownMenuItem>
										<IconFileText className="size-4" />
										Open schema
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem>
										<IconEdit className="size-4" />
										Edit table name
									</DropdownMenuItem>
									<DropdownMenu>
										<DropdownMenuTrigger>
											<IconDownload className="size-4" />
											Export data
										</DropdownMenuTrigger>
										<DropdownMenuContent>
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
										</DropdownMenuContent>
										<DropdownMenuSeparator />
										<DropdownMenuItem variant="destructive">
											<IconTrash className="size-4" />
											Delete table
										</DropdownMenuItem>
									</DropdownMenu>
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
*/}
					<Kbd>{rowCount}</Kbd>
				</div>
			</Link>
		</li>
	);
};
