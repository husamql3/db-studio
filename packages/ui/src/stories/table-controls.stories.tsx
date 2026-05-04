import { MoreHorizontal } from "lucide-react";
import { Button } from "../primitives/button";
import { Checkbox } from "../primitives/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../primitives/dropdown-menu";
import { Pagination, PaginationContent, PaginationItem } from "../primitives/pagination";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../primitives/table";

export default {
	title: "UI/Table Controls",
};

const rows = [
	{ id: 1, name: "customers", type: "table", rows: "2,142" },
	{ id: 2, name: "orders", type: "table", rows: "18,903" },
	{ id: 3, name: "daily_revenue", type: "view", rows: "365" },
];

export const TableToolbar = () => (
	<div className="w-[620px] rounded-xl border bg-background p-3 text-foreground">
		<div className="mb-3 flex items-center justify-between">
			<div>
				<p className="font-medium text-sm">Schema objects</p>
				<p className="text-muted-foreground text-xs">
					Selection, row actions, and pagination density.
				</p>
			</div>
			<Button size="sm">Add table</Button>
		</div>
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-8">
						<Checkbox />
					</TableHead>
					<TableHead>Name</TableHead>
					<TableHead>Type</TableHead>
					<TableHead className="text-right">Rows</TableHead>
					<TableHead className="w-8" />
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.id}>
						<TableCell>
							<Checkbox />
						</TableCell>
						<TableCell className="font-medium">{row.name}</TableCell>
						<TableCell>{row.type}</TableCell>
						<TableCell className="text-right tabular-nums">{row.rows}</TableCell>
						<TableCell>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon-sm"
									>
										<MoreHorizontal />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem>Open</DropdownMenuItem>
									<DropdownMenuItem>Copy name</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
		<Pagination className="mt-3 justify-end">
			<PaginationContent>
				<PaginationItem>
					<Button
						variant="outline"
						size="sm"
					>
						Previous
					</Button>
				</PaginationItem>
				<PaginationItem>
					<Button
						variant="outline"
						size="sm"
					>
						Next
					</Button>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	</div>
);
