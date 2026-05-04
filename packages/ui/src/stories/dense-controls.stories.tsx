import { Database, Search } from "lucide-react";
import { Badge } from "../primitives/badge";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Kbd } from "../primitives/kbd";
import { Label } from "../primitives/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../primitives/select";
import { Toggle } from "../primitives/toggle";

export default {
	title: "UI/Dense Controls",
};

export const Controls = () => (
	<div className="flex w-[520px] flex-col gap-4 rounded-xl border bg-background p-4 text-foreground">
		<div className="flex items-center justify-between">
			<div>
				<p className="font-medium text-sm">Connection toolbar</p>
				<p className="text-muted-foreground text-xs">
					Compact controls used in the web app chrome.
				</p>
			</div>
			<Badge variant="secondary">PostgreSQL</Badge>
		</div>
		<div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
			<div className="space-y-1">
				<Label htmlFor="dense-search">Search tables</Label>
				<div className="relative">
					<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2 size-3 text-muted-foreground" />
					<Input
						id="dense-search"
						className="pl-7"
						placeholder="Filter schema objects"
					/>
				</div>
			</div>
			<Select defaultValue="public">
				<SelectTrigger>
					<SelectValue placeholder="Schema" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="public">public</SelectItem>
					<SelectItem value="analytics">analytics</SelectItem>
					<SelectItem value="audit">audit</SelectItem>
				</SelectContent>
			</Select>
			<Button>
				<Database />
				Connect
			</Button>
		</div>
		<div className="flex items-center gap-2">
			<Toggle size="sm">PK</Toggle>
			<Toggle size="sm">FK</Toggle>
			<Button
				variant="outline"
				size="sm"
			>
				Refresh
			</Button>
			<Kbd>⌘K</Kbd>
		</div>
	</div>
);
