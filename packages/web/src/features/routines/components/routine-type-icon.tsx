import type { RoutineInfoSchemaType } from "@db-studio/shared/types";
import { cn } from "@db-studio/ui/utils";
import { FileCode2, SquareFunction } from "lucide-react";

export const RoutineTypeIcon = ({
	routineType,
	className,
}: {
	routineType: RoutineInfoSchemaType["routineType"];
	className?: string;
}) => {
	const Icon = routineType === "procedure" ? FileCode2 : SquareFunction;

	return (
		<Icon
			aria-hidden="true"
			className={cn("size-4 shrink-0", className)}
		/>
	);
};
