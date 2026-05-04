import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { Badge } from "@db-studio/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";

export const TypeBadge = ({ col }: { col: ColumnInfoSchemaType }) => {
	if (col.dataTypeLabel === "enum" && col.enumValues && col.enumValues.length > 0) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge
						variant="outline"
						className="font-mono cursor-default truncate"
					>
						{col.dataTypeLabel}
					</Badge>
				</TooltipTrigger>
				<TooltipContent side="right">
					<div className="text-xs space-y-0.5">
						<p className="text-zinc-400 mb-1">Enum values:</p>
						{col.enumValues.map((v) => (
							<p
								key={v}
								className="font-mono"
							>
								{v}
							</p>
						))}
					</div>
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Badge
			variant="outline"
			className="font-mono"
		>
			{col.dataTypeLabel}
		</Badge>
	);
};
